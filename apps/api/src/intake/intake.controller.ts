import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AgentType, intakeMessageSchema, type IntakeMessage } from '@ledgerpilot/shared';
import { Public } from '../auth/decorators.js';
import { AllowInactive } from '../billing/entitlements.decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { deriveIntakeSecret } from '../common/intake-secret.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgentRunsService } from '../agent-runs/agent-runs.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { Throttle } from '@nestjs/throttler';

/**
 * Inbound inquiry webhook (WhatsApp/email forwarding). Authenticated by a
 * per-tenant HMAC over the raw body, plus an idempotency key.
 *
 * The signing secret is derived per tenant rather than shared. With one global
 * secret, anyone holding it could post inquiries into any organization simply by
 * changing the `x-bizopsmate-org` header, which is a multi-tenancy hole rather
 * than merely untidy.
 *
 * Headers: x-bizopsmate-org (clerk org id), x-bizopsmate-signature (hex HMAC).
 */
@Controller('intake')
@AllowInactive()
export class IntakeController {
  private readonly logger = new Logger(IntakeController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRuns: AgentRunsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  async ingest(
    @Req() req: Request,
    @Headers('x-bizopsmate-org') clerkOrgId: string | undefined,
    @Headers('x-bizopsmate-signature') signature: string | undefined,
    @Body(new ZodPipe(intakeMessageSchema)) body: IntakeMessage,
  ) {
    if (!clerkOrgId) throw new BadRequestException('Missing org header');

    const rows = await this.prisma.client.$queryRaw<{ resolve_tenant_id: string | null }[]>`
      SELECT resolve_tenant_id(${clerkOrgId}) AS resolve_tenant_id
    `;
    const tenantId = rows[0]?.resolve_tenant_id;
    // Same error for an unknown org as for a bad signature, so this endpoint
    // cannot be used to discover which organizations exist.
    if (!tenantId) throw new UnauthorizedException('Bad signature');

    this.verifySignature(tenantId, req.rawBody, signature);

    // The inquiry is stored regardless of plan state, so nothing a customer sent
    // is ever lost. Only the AI processing is gated.
    const inquiry = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.inquiry.findUnique({
        where: {
          tenantId_idempotencyKey: { tenantId, idempotencyKey: body.idempotencyKey },
        },
      });
      if (existing) return existing;
      return tx.inquiry.create({
        data: {
          tenantId,
          channel: body.channel,
          fromIdentifier: body.from,
          fromName: body.fromName,
          subject: body.subject,
          body: body.body,
          idempotencyKey: body.idempotencyKey,
          receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined,
        },
      });
    });

    const state = await this.entitlements.getState(tenantId);
    if (!state.active) {
      this.logger.log(`Inquiry ${inquiry.id} stored without processing: ${state.reason}`);
      return {
        inquiryId: inquiry.id,
        agentRunId: null,
        status: 'NOT_PROCESSED',
        detail: state.reason,
      };
    }

    const run = await this.agentRuns.createAndEnqueue({
      tenantId,
      agentType: AgentType.INQUIRY,
      inquiryId: inquiry.id,
      inputJson: { body: body.body, from: body.from, channel: body.channel },
      idempotencyKey: `inquiry:${inquiry.id}`,
    });

    return { inquiryId: inquiry.id, agentRunId: run.id, status: run.status };
  }

  private verifySignature(
    tenantId: string,
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ) {
    // Only skippable in local development. assertAuthConfigIsSafe refuses to boot
    // in production without INTAKE_HMAC_SECRET.
    if (!process.env.INTAKE_HMAC_SECRET) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Intake signing is not configured');
      }
      return;
    }

    if (!rawBody || !signature) throw new UnauthorizedException('Missing signature');

    const expected = createHmac('sha256', deriveIntakeSecret(tenantId))
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Bad signature');
    }
  }
}
