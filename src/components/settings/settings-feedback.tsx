import { AlertCircle, Check } from "lucide-react";

export function SettingsFeedback({
  error,
  notice,
}: {
  error: string | null;
  notice: string | null;
}) {
  if (error)
    return (
      <p role="alert" className="inline-error">
        <AlertCircle className="size-4 shrink-0" />
        {error}
      </p>
    );
  if (notice)
    return (
      <p role="status" className="inline-success">
        <Check className="size-4 shrink-0" />
        {notice}
      </p>
    );
  return null;
}
