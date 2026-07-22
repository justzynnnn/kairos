import type { Metadata } from "next";
import { OnboardingWorkspace } from "@/components/onboarding-workspace";

export const metadata: Metadata = { title: "Set up Kairos" };

export default function OnboardingPage() {
  return (
    <div className="page-stack content-narrow">
      <header className="page-header">
        <div>
          <p className="eyebrow">Three deliberate choices</p>
          <h1 className="page-title">Set up Kairos</h1>
          <p className="page-description">
            Define your day, protect your availability, then review your first
            schedule item.
          </p>
        </div>
      </header>
      <OnboardingWorkspace />
    </div>
  );
}
