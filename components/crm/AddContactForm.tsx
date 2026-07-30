"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateContact } from "@/hooks/useContacts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, User, Mail, Phone, Building2, Briefcase, Tag, FileText } from "lucide-react";

const STATUSES = [
  { value: "lead", label: "Lead", color: "bg-zinc-700 text-zinc-300" },
  { value: "prospect", label: "Prospect", color: "bg-blue-500/20 text-blue-400" },
  { value: "active", label: "Active", color: "bg-green-500/20 text-green-400" },
  { value: "inactive", label: "Inactive", color: "bg-yellow-500/20 text-yellow-400" },
  { value: "closed", label: "Closed", color: "bg-red-500/20 text-red-400" },
];

interface AddContactFormProps {
  clientId: string;
  userId: string; // kept for API compatibility but not used in component
}

export function AddContactForm({ clientId }: AddContactFormProps) {
  const router = useRouter();
  const { mutateAsync: createContact, isPending: saving } = useCreateContact();
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company: "",
    job_title: "",
    status: "lead",
    source: "",
    notes: "",
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleStatusChange = (value: string | null) => {
    if (value) {
      setFormData(prev => ({ ...prev, status: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.first_name.trim()) {
      toast.error("First name is required");
      return;
    }

    try {
      await createContact({
        clientId,
        first_name: formData.first_name.trim(),
        last_name:  formData.last_name.trim()  || null,
        email:      formData.email.trim()      || null,
        phone:      formData.phone.trim()      || null,
        company:    formData.company.trim()    || null,
        job_title:  formData.job_title.trim()  || null,
        status:     formData.status,
        source:     formData.source.trim()     || null,
        notes:      formData.notes.trim()      || null,
      });

      toast.success("Contact added successfully!");
      router.push("/crm");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add contact.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <Card className="bg-zinc-800/50 border-zinc-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="w-5 h-5" />
            Basic Information
          </CardTitle>
          <CardDescription>
            Essential contact details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name" className="text-sm font-medium">
                First Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => handleInputChange("first_name", e.target.value)}
                placeholder="John"
                className="bg-zinc-800 border-zinc-700 focus:border-zinc-600"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="last_name" className="text-sm font-medium">
                Last Name
              </Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => handleInputChange("last_name", e.target.value)}
                placeholder="Doe"
                className="bg-zinc-800 border-zinc-700 focus:border-zinc-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                placeholder="john.doe@example.com"
                className="bg-zinc-800 border-zinc-700 focus:border-zinc-600"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Phone
              </Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                placeholder="+61 400 000 000"
                autoComplete="tel"
                className="bg-zinc-800 border-zinc-700 focus:border-zinc-600"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Professional Information */}
      <Card className="bg-zinc-800/50 border-zinc-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="w-5 h-5" />
            Professional Information
          </CardTitle>
          <CardDescription>
            Work-related details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company" className="text-sm font-medium flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Company
              </Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => handleInputChange("company", e.target.value)}
                placeholder="Acme Corp"
                className="bg-zinc-800 border-zinc-700 focus:border-zinc-600"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="job_title" className="text-sm font-medium">
                Job Title
              </Label>
              <Input
                id="job_title"
                value={formData.job_title}
                onChange={(e) => handleInputChange("job_title", e.target.value)}
                placeholder="Finance broker"
                className="bg-zinc-800 border-zinc-700 focus:border-zinc-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status" className="text-sm font-medium">
                Status
              </Label>
              <Select value={formData.status} onValueChange={handleStatusChange}>
                <SelectTrigger id="status" aria-label="Contact status" className="bg-zinc-800 border-zinc-700 focus:border-zinc-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${status.color}`} />
                        {status.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="source" className="text-sm font-medium flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Source
              </Label>
              <Input
                id="source"
                value={formData.source}
                onChange={(e) => handleInputChange("source", e.target.value)}
                placeholder="Website, Referral, etc."
                className="bg-zinc-800 border-zinc-700 focus:border-zinc-600"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="bg-zinc-800/50 border-zinc-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5" />
            Notes
          </CardTitle>
          <CardDescription>
            Additional information about this contact
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => handleInputChange("notes", e.target.value)}
            placeholder="Add any relevant notes about this contact..."
            rows={4}
            className="bg-zinc-800 border-zinc-700 focus:border-zinc-600 resize-none"
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/crm")}
          className="border-zinc-700 hover:bg-zinc-800"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Cancel
        </Button>
        
        <Button
          type="submit"
          disabled={saving || !formData.first_name.trim()}
          className="flex-1"
        >
          {saving ? "Adding Contact..." : "Add Contact"}
        </Button>
      </div>
    </form>
  );
}
