"use client";

import { useRouter } from "next/navigation";

export default function PrivacyChoiceButton() {
  const router = useRouter();

  const chooseAgain = () => {
    try {
      localStorage.removeItem("cat_analytics_consent");
    } catch {}
    router.push("/coding");
    router.refresh();
  };

  return (
    <button type="button" className="btn btn-outline" onClick={chooseAgain}>
      Change Analytics Choice
    </button>
  );
}
