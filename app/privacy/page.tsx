"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export default function PrivacyPolicyPage() {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(true);
  const t = useTranslations("legal");

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  const handleBack = () => {
    if (canGoBack) {
      router.back();
    } else {
      router.push("/");
    }
  };

  const sections = [
    { id: "sec-1", title: t("privacy.sections.collectInfo.tocTitle") },
    { id: "sec-2", title: t("privacy.sections.purpose.tocTitle") },
    { id: "sec-3", title: t("privacy.sections.thirdParty.tocTitle") },
    { id: "sec-4", title: t("privacy.tocSections.sec4") },
    { id: "sec-5", title: t("privacy.sections.rights.tocTitle") },
    { id: "sec-6", title: t("privacy.tocSections.sec6") },
    { id: "sec-7", title: t("privacy.tocSections.sec7") },
    { id: "sec-8", title: t("privacy.sections.contact.tocTitle") },
  ];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const headerOffset = 80;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition =
        elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* Simple Sticky Header */}
      <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-sm border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 transition-colors text-sm font-medium"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {t("common.back")}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">
            {t("privacy.title")}
          </h1>
          <p className="text-sm text-slate-400">{t("common.lastUpdated")}</p>
        </div>

        <p className="mb-12 text-[15px] text-slate-600 leading-relaxed">
          {t("privacy.intro")}
        </p>

        {/* Simple Table of Contents */}
        <nav className="mb-16 p-6 bg-slate-50 rounded-2xl">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            {t("common.tableOfContents")}
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => scrollToSection(s.id)}
                  className="text-[13px] text-blue-600 hover:text-blue-800 transition-colors text-left"
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-16">
          <section id="sec-1" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-6 border-l-4 border-slate-200 pl-4">
              {t("privacy.sections.collectInfo.title")}
            </h2>
            <div className="pl-5 space-y-8">
              <div>
                <h3 className="text-[15px] font-bold text-slate-800 mb-3">
                  {t("privacy.sections.collectInfo.userProvided.title")}
                </h3>
                <ul className="space-y-2 text-[15px] text-slate-600 list-disc pl-5">
                  <li>
                    {t("privacy.sections.collectInfo.userProvided.items.0")}
                  </li>
                  <li>{t("privacy.sections.collectInfo.userProvided.items.1")}</li>
                  <li>{t("privacy.sections.collectInfo.userProvided.items.2")}</li>
                  <li>{t("privacy.sections.collectInfo.userProvided.items.3")}</li>
                </ul>
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-800 mb-3">
                  {t("privacy.sections.collectInfo.autoCollected.title")}
                </h3>
                <ul className="space-y-2 text-[15px] text-slate-600 list-disc pl-5">
                  <li>
                    {t("privacy.sections.collectInfo.autoCollected.items.0")}
                  </li>
                  <li>{t("privacy.sections.collectInfo.autoCollected.items.1")}</li>
                  <li>{t("privacy.sections.collectInfo.autoCollected.items.2")}</li>
                </ul>
              </div>
            </div>
          </section>

          <section id="sec-2" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-6 border-l-4 border-slate-200 pl-4">
              {t("privacy.sections.purpose.title")}
            </h2>
            <div className="pl-5 space-y-8">
              <div>
                <h3 className="text-[15px] font-bold text-slate-800 mb-3">
                  {t("privacy.sections.purpose.serviceProvision.title")}
                </h3>
                <ul className="space-y-2 text-[15px] text-slate-600 list-disc pl-5">
                  <li>{t("privacy.sections.purpose.serviceProvision.items.0")}</li>
                  <li>{t("privacy.sections.purpose.serviceProvision.items.1")}</li>
                  <li>{t("privacy.sections.purpose.serviceProvision.items.2")}</li>
                </ul>
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-800 mb-3">
                  {t("privacy.sections.purpose.improvement.title")}
                </h3>
                <ul className="space-y-2 text-[15px] text-slate-600 list-disc pl-5">
                  <li>{t("privacy.sections.purpose.improvement.items.0")}</li>
                  <li>{t("privacy.sections.purpose.improvement.items.1")}</li>
                </ul>
              </div>
            </div>
          </section>

          <section id="sec-3" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              {t("privacy.sections.thirdParty.title")}
            </h2>
            <div className="pl-5 space-y-4 text-[15px] text-slate-600 leading-relaxed">
              <p>
                {t("privacy.sections.thirdParty.description")}
              </p>
              <div className="p-5 bg-slate-50 rounded-xl">
                <p className="font-bold text-slate-800 mb-2">
                  {t("privacy.sections.thirdParty.externalServices")}
                </p>
                <ul className="space-y-1.5 text-sm">
                  <li>
                    <span className="font-medium">Google OAuth</span>:
                    {" "}{t("privacy.sections.thirdParty.googleOAuth")}
                  </li>
                  <li>
                    <span className="font-medium">OpenAI API</span>:
                    {" "}{t("privacy.sections.thirdParty.openAI")}
                  </li>
                  <li>
                    <span className="font-medium">Railway</span>:
                    {" "}{t("privacy.sections.thirdParty.railway")}
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section id="sec-5" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              {t("privacy.sections.rights.title")}
            </h2>
            <p className="pl-5 mb-4 text-[15px] text-slate-600">
              {t("privacy.sections.rights.description")}
            </p>
            <ul className="pl-10 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[15px] text-slate-600 list-disc">
              <li>{t("privacy.sections.rights.items.0")}</li>
              <li>{t("privacy.sections.rights.items.1")}</li>
              <li>{t("privacy.sections.rights.items.2")}</li>
              <li>{t("privacy.sections.rights.items.3")}</li>
            </ul>
          </section>

          <section id="sec-8" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-6 border-l-4 border-slate-200 pl-4">
              {t("privacy.sections.contact.title")}
            </h2>
            <div className="pl-5">
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-sm font-bold text-slate-900 mb-1">
                  {t("common.privacyContact")}
                </p>
                <p className="text-sm text-blue-600">{t("common.privacyEmail")}</p>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="py-20 border-t border-slate-50 text-center">
        <p className="text-slate-300 text-[10px] uppercase tracking-widest">
          {t("common.copyright")}
        </p>
      </footer>
    </div>
  );
}
