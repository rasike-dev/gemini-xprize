import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  lastContact: string | null;
}

export default async function CustomersPage() {
  const customers = await apiFetchSafe<Customer[]>('/customers', []);

  return (
    <div>
      <PageHeader title="Customers" subtitle="People and businesses you work with." />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Last contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.length === 0 ? (
              <tr>
                <td className="px-5 py-4 text-slate-400" colSpan={4}>
                  No customers yet.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">{c.name}</td>
                  <td className="px-5 py-3 text-slate-600">{c.phone ?? '-'}</td>
                  <td className="px-5 py-3 text-slate-600">{c.email ?? '-'}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {c.lastContact ? new Date(c.lastContact).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
