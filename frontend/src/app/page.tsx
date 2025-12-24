"use client";

import { CopilotKit } from "@copilotkit/react-core";
import { CopilotPopup } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

export default function Home() {
  return (
    <CopilotKit runtimeUrl=***process.env.NEXT_PUBLIC_COPILOT_API_URL || "http://localhost:8080/api/chat"***>
      <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-800">Infographic Agent</h1>
          <p className="mt-4 text-lg text-gray-600">
            Enter a topic or URL below, and I'll generate a presentation for you.
          </p>
        </div>
      </main>
      <CopilotPopup
        instructions="Please provide a topic or a URL to generate a presentation."
        defaultOpen={true}
        labels={{
          title: "Infographic Agent",
          initial: "Hi! I'm here to help you create presentations. What's your topic?",
        }}
      />
    </CopilotKit>
  );
}