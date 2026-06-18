import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Req } from '@nestjs/common';
import { AgentType, intakeMessageSchema, type IntakeMessage } from '@ledgerpilot/shared';
import { Public } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgentRunsService } from '../agent-runs/agent-runs.service.js';
import { Throttle } from '@nestjs/throttler';

/**
 * Inbound inquiry webhook (simulated WhatsApp/email for the MVP). Authenticated
 * by a per-tenant HMAC over the raw body + an idempotency key. On success:
 * persist the Inquiry, then create + enqueue an INQUIRY AgentRun.
 *
 * Header: x-ledgerpilot-org (clerk org id), x-ledgerpilot-signature (hex HMAC).
 */
@Controller('intake')
export class IntakeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRuns: AgentRunsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  async ingest(
    @Req() req: Request,
    @Headers('x-ledgerpilot-org') clerkOrgId: string | undefined,
    @Headers('x-ledgerpilot-signature') signature: string | undefined,
    @Body(new ZodPipe(intakeMessageSchema)) body: IntakeMessage,
  ) {
    if (!clerkOrgId) throw new BadRequestException('Missing org header');
    this.verifySignature(req.rawBody, signature);

    const rows = await this.prisma.client.$queryRaw<{ resolve_tenant_id: string | null }[]>`
      SELECT resolve_tenant_id(${clerkOrgId}) AS resolve_tenant_id
    `;
    const tenantId = rows[0]?.resolve_tenant_id;
    if (!tenantId) throw new BadRequestException('Unknown organization');

    // Idempotent inquiry insert (unique on tenantId + idempotencyKey).
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

    const run = await this.agentRuns.createAndEnqueue({
      tenantId,
      agentType: AgentType.INQUIRY,
      inquiryId: inquiry.id,
      inputJson: { body: body.body, from: body.from, channel: body.channel },
      idempotencyKey: `inquiry:${inquiry.id}`,
    });

    return { inquiryId: inquiry.id, agentRunId: run.id, status: run.status };
  }

  private verifySignature(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = process.env.INTAKE_HMAC_SECRET;
    // In dev without a secret we skip; production always sets one.
    if (!secret) return;
    if (!rawBody || !signature) throw new UnauthorizedException('Missing signature');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Bad signature');
    }
  }
}
