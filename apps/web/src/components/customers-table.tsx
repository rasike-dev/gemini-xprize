'use client';

import { useState } from 'react';
import { Button } from '@/components/form';
import { CustomerFormModal } from '@/components/customer-form';
import { useAction } from '@/lib/use-action';
import type { CustomerRow } from '@/lib/types';

export function CustomersTable({ customers }: { customers: CustomerRow[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const action = useAction();

  function remove(customer: CustomerRow) {
    // A customer with history cannot be deleted, and the API says so clearly, so
    // this only needs to guard against a misclick.
    if (!window.confirm(`Delete ${customer.name}? This cannot be undone.`)) return;

    void action.run(`delete:${customer.id}`, `/customers/${customer.id}`, {
      method: 'DELETE',
      success: `${customer.name} deleted.`,
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)}>Add customer</Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Last contact</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-center text-slate-400" colSpan={5}>
                  No customers yet. Add your first one to start quoting.
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr key={customer.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">{customer.name}</td>
                  <td className="px-5 py-3 text-slate-600">{customer.phone ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{customer.email ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {customer.lastContact
                      ? new Date(customer.lastContact).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setEditing(customer)}
                        className="text-xs font-medium text-brand underline hover:text-brand-dark"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={action.busy}
                        onClick={() => remove(customer)}
                        className="text-xs font-medium text-rose-600 underline hover:text-rose-700 disabled:opacity-50"
                      >
                        {action.isPending(`delete:${customer.id}`) ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating ? <CustomerFormModal onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <CustomerFormModal customer={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
