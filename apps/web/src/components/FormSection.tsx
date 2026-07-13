import type { ReactNode } from "react";

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** One section of a multi-section form (SPEC_V0.1.md §4: "Bio → Guardian → Class"). */
export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <fieldset className="flex flex-col gap-4 border-b border-muted/20 pb-6 last:border-0 last:pb-0">
      <div>
        <legend className="text-base font-semibold text-text">{title}</legend>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}
