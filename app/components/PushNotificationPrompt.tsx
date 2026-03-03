"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UPDATE_SCHEDULES } from "@/lib/constants";

const VISIT_COUNT_KEY = "push-prompt-visit-count";
const DISMISSED_UNTIL_KEY = "push-prompt-dismissed-until";
const VISITS_BEFORE_FIRST_PROMPT = 3;
const DISMISS_DAYS = 7;

export default function PushNotificationPrompt() {
  const router = useRouter();
  const t = useTranslations("notifications.pushPrompt");
  const [showPrompt, setShowPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkAndShowPrompt();
  }, []);

  const checkAndShowPrompt = async () => {
    // プッシュ通知がサポートされているか確認
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }

    // 既にプッシュ通知がONか確認
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // 既にONなので表示しない
        return;
      }
    } catch (error) {
      console.error("Error checking push status:", error);
      return;
    }

    // 閉じた期限を確認
    const dismissedUntil = localStorage.getItem(DISMISSED_UNTIL_KEY);
    if (dismissedUntil && new Date(dismissedUntil) > new Date()) {
      return;
    }

    // 訪問回数をカウント
    const visitCount =
      parseInt(localStorage.getItem(VISIT_COUNT_KEY) || "0", 10) + 1;
    localStorage.setItem(VISIT_COUNT_KEY, visitCount.toString());

    // 初回表示は一定回数訪問後
    if (visitCount >= VISITS_BEFORE_FIRST_PROMPT) {
      // 少し遅延させて表示（他のモーダルとの競合を避ける）
      setTimeout(() => {
        setShowPrompt(true);
      }, 2000);
    }
  };

  const handleEnable = async () => {
    setIsLoading(true);

    try {
      // 通知許可を求める
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert(t("permissionDenied"));
        setIsLoading(false);
        return;
      }

      // Service Worker登録
      const registration = await navigator.serviceWorker.ready;

      // VAPID公開鍵を取得
      const response = await fetch("/api/push/subscribe");
      const { publicKey } = await response.json();

      // プッシュマネージャーにサブスクリプションを登録
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // サーバーに保存
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });

      alert(t("enabled"));
      setShowPrompt(false);
      // 訪問カウントをリセット
      localStorage.removeItem(VISIT_COUNT_KEY);
      localStorage.removeItem(DISMISSED_UNTIL_KEY);
    } catch (error) {
      console.error("Error enabling push:", error);
      alert(t("failed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // 7日間は再表示しない
    const dismissedUntil = new Date();
    dismissedUntil.setDate(dismissedUntil.getDate() + DISMISS_DAYS);
    localStorage.setItem(DISMISSED_UNTIL_KEY, dismissedUntil.toISOString());
    // 訪問カウントをリセット（次回の定期表示のため）
    localStorage.setItem(VISIT_COUNT_KEY, "0");
  };

  const handleGoToSettings = () => {
    setShowPrompt(false);
    router.push("/settings");
  };

  // VAPID公開鍵をUint8Arrayに変換
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-slide-up">
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🔔</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {t("title")}
          </h2>
          <p className="text-gray-600 text-sm">
            {t("description")}
          </p>
        </div>

        {/* 通知スケジュール */}
        <div className="bg-blue-50 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-gray-900 mb-2 text-sm">
            {t("scheduleTitle")}
          </h3>
          <ul className="space-y-1.5 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-blue-500">•</span>
              <span>
                <strong>{UPDATE_SCHEDULES.STOCK_ANALYSIS}</strong> -
                {t("scheduleAnalysis")}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500">•</span>
              <span>
                <strong>{UPDATE_SCHEDULES.PERSONAL_RECOMMENDATIONS}</strong> -
                {t("scheduleRecommendations")}
              </span>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleEnable}
            disabled={isLoading}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t("enabling") : t("enableButton")}
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleGoToSettings}
              className="flex-1 py-2.5 px-4 text-gray-600 bg-gray-100 rounded-xl font-medium hover:bg-gray-200 transition-colors text-sm"
            >
              {t("goToSettings")}
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 py-2.5 px-4 text-gray-500 rounded-xl font-medium hover:bg-gray-100 transition-colors text-sm"
            >
              {t("later")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
