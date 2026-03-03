"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export default function TermsOfServicePage() {
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
    { id: "art-1", title: t("terms.sections.application.tocTitle") },
    { id: "art-2", title: t("terms.sections.definitions.tocTitle") },
    { id: "art-3", title: t("terms.sections.registration.tocTitle") },
    { id: "art-4", title: t("terms.sections.serviceContent.tocTitle") },
    { id: "art-5", title: t("terms.sections.disclaimerArticle.tocTitle") },
    { id: "art-6", title: t("terms.sections.prohibited.tocTitle") },
    { id: "art-7", title: t("terms.sections.usageRestrictions.tocTitle") },
    { id: "art-8", title: t("terms.sections.intellectualProperty.tocTitle") },
    { id: "art-9", title: t("terms.sections.termsChanges.tocTitle") },
    { id: "art-10", title: t("terms.sections.withdrawal.tocTitle") },
    { id: "art-11", title: t("terms.sections.jurisdiction.tocTitle") },
    { id: "art-12", title: t("terms.sections.contact.tocTitle") },
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
            {t("terms.title")}
          </h1>
          <p className="text-sm text-slate-400">{t("common.lastUpdated")}</p>
        </div>

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
          <section id="art-1" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              {t("terms.sections.application.title")}
            </h2>
            <div className="pl-5 space-y-3 text-[15px] leading-relaxed text-slate-600">
              <p>{t("terms.sections.application.items.0")}</p>
              <p>{t("terms.sections.application.items.1")}</p>
              <p>{t("terms.sections.application.items.2")}</p>
            </div>
          </section>

          <section id="art-2" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              {t("terms.sections.definitions.title")}
            </h2>
            <p className="pl-5 mb-4 text-[15px] text-slate-600">
              {t("terms.sections.definitions.description")}
            </p>
            <ul className="pl-5 space-y-3 text-[15px] leading-relaxed text-slate-600">
              <li className="flex gap-2">
                <span>1.</span>
                <span>{t("terms.sections.definitions.items.0")}</span>
              </li>
              <li className="flex gap-2">
                <span>2.</span>
                <span>{t("terms.sections.definitions.items.1")}</span>
              </li>
              <li className="flex gap-2">
                <span>3.</span>
                <span>{t("terms.sections.definitions.items.2")}</span>
              </li>
              <li className="flex gap-2">
                <span>4.</span>
                <span>{t("terms.sections.definitions.items.3")}</span>
              </li>
              <li className="flex gap-2">
                <span>5.</span>
                <span>{t("terms.sections.definitions.items.4")}</span>
              </li>
            </ul>
          </section>

          <section id="art-3" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              {t("terms.sections.registration.title")}
            </h2>
            <div className="pl-5 space-y-3 text-[15px] leading-relaxed text-slate-600">
              <p>{t("terms.sections.registration.items.0")}</p>
              <p>{t("terms.sections.registration.items.1")}</p>
              <p>{t("terms.sections.registration.items.2")}</p>
            </div>
          </section>

          <section id="art-4" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              {t("terms.sections.serviceContent.title")}
            </h2>
            <p className="pl-5 mb-4 text-[15px] text-slate-600">
              {t("terms.sections.serviceContent.description")}
            </p>
            <ul className="pl-10 list-disc space-y-2 text-[15px] text-slate-600">
              <li>{t("terms.sections.serviceContent.features.0")}</li>
              <li>{t("terms.sections.serviceContent.features.1")}</li>
              <li>{t("terms.sections.serviceContent.features.2")}</li>
              <li>{t("terms.sections.serviceContent.features.3")}</li>
              <li>{t("terms.sections.serviceContent.features.4")}</li>
            </ul>
            <div className="mt-6 p-4 bg-rose-50 rounded-xl text-rose-800 text-sm font-medium">
              {t("terms.sections.serviceContent.warning")}
            </div>
          </section>

          <section id="art-5" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              {t("terms.sections.disclaimerArticle.title")}
            </h2>
            <div className="pl-5 space-y-8 text-[15px] leading-relaxed text-slate-600">
              <div>
                <p className="font-bold text-slate-900 mb-2">
                  {t("terms.sections.disclaimerArticle.investmentAdviceDenial.title")}
                </p>
                <p>
                  {t("terms.sections.disclaimerArticle.investmentAdviceDenial.description")}
                </p>
              </div>
              <div>
                <p className="font-bold text-slate-900 mb-2">
                  {t("terms.sections.disclaimerArticle.investmentRisk.title")}
                </p>
                <p className="mb-2">
                  {t("terms.sections.disclaimerArticle.investmentRisk.description")}
                </p>
                <ul className="pl-5 list-disc space-y-1">
                  <li>{t("terms.sections.disclaimerArticle.investmentRisk.items.0")}</li>
                  <li>{t("terms.sections.disclaimerArticle.investmentRisk.items.1")}</li>
                  <li>{t("terms.sections.disclaimerArticle.investmentRisk.items.2")}</li>
                </ul>
              </div>
              <div>
                <p className="font-bold text-slate-900 mb-2">
                  {t("terms.sections.disclaimerArticle.infoAccuracy.title")}
                </p>
                <p>
                  {t("terms.sections.disclaimerArticle.infoAccuracy.description")}
                </p>
              </div>
              <div>
                <p className="font-bold text-slate-900 mb-2">
                  {t("terms.sections.disclaimerArticle.serviceInterruption.title")}
                </p>
                <p>
                  {t("terms.sections.disclaimerArticle.serviceInterruption.description")}
                </p>
              </div>
              <div>
                <p className="font-bold text-slate-900 mb-2">
                  {t("terms.sections.disclaimerArticle.liabilityLimit.title")}
                </p>
                <p>
                  {t("terms.sections.disclaimerArticle.liabilityLimit.description")}
                </p>
              </div>
            </div>
          </section>

          <section id="art-6" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              {t("terms.sections.prohibited.title")}
            </h2>
            <p className="pl-5 mb-4 text-[15px] text-slate-600">
              {t("terms.sections.prohibited.description")}
            </p>
            <ul className="pl-5 space-y-2 text-[15px] text-slate-600">
              {[
                t("terms.sections.prohibited.items.0"),
                t("terms.sections.prohibited.items.1"),
                t("terms.sections.prohibited.items.2"),
                t("terms.sections.prohibited.items.3"),
                t("terms.sections.prohibited.items.4"),
                t("terms.sections.prohibited.items.5"),
                t("terms.sections.prohibited.items.6"),
              ].map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span>•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section id="art-11" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              {t("terms.sections.jurisdiction.title")}
            </h2>
            <div className="pl-5 space-y-3 text-[15px] text-slate-600">
              <p>{t("terms.sections.jurisdiction.items.0")}</p>
              <p>{t("terms.sections.jurisdiction.items.1")}</p>
            </div>
          </section>

          <section id="art-12" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              {t("terms.sections.contact.title")}
            </h2>
            <div className="pl-5">
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-sm font-bold text-slate-900 mb-1">
                  {t("common.customerSupport")}
                </p>
                <p className="text-sm text-blue-600">{t("common.contactEmail")}</p>
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
