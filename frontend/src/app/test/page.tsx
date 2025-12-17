"use client";

import Link from "next/link";
import { AudioRecorderTest } from "@/components/AudioRecorderTest";

export default function TestPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Mic Test</h1>
            <p className="text-slate-400 text-sm">
              Record and play back audio locally
            </p>
          </div>
          <Link href="/" className="text-sm underline text-slate-200">
            Back
          </Link>
        </div>

        <AudioRecorderTest />
      </div>
    </div>
  );
}
