import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { AddContactForm } from "@/components/crm/AddContactForm";

export const dynamic = "force-dynamic";

export default async function AddContactPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Add New Contact</h1>
        <p className="text-zinc-400">
          Add a new contact for {client?.name ?? "your client"}
        </p>
      </div>
      
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <AddContactForm 
          clientId={user.client_id} 
          userId={user.id}
        />
      </div>
    </div>
  );
}
