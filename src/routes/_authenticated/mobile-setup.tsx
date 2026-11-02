import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, RotateCcw } from "lucide-react";
import { Page } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { mobileConfig } from "@/lib/mobile-config";
import { retryNativePush } from "@/lib/push-admin.functions";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/mobile-setup")({
  head: () => ({ meta: [
    { title: "Mobile store setup — Book a Crew" },
    { name: "description", content: "Book a Crew iOS and Android signing, store artwork and native notification setup." },
    { property: "og:title", content: "Mobile store setup — Book a Crew" },
    { property: "og:description", content: "Prepare Book a Crew for TestFlight and Google Play testing." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: MobileSetup,
});

function MobileSetup() {
  const retry = useServerFn(retryNativePush);
  const [busy, setBusy] = useState(false);
  async function retryAlerts() {
    setBusy(true);
    try { const r = await retry(); toast.success(`${r.processed} of ${r.attempted} queued alerts processed`); }
    catch (error) { toast.error(friendlyError(error)); }
    finally { setBusy(false); }
  }
  return <Page title="Mobile store setup" actions={<Button variant="outline" disabled={busy} onClick={retryAlerts}><RotateCcw className="h-4 w-4" />Retry pending alerts</Button>}>
    <div className="space-y-8 text-sm">
      <section className="space-y-3 border-b border-border pb-6">
        <h2 className="text-xl font-semibold">1. Despia project</h2>
        <dl className="grid gap-2 sm:grid-cols-[180px_1fr]">
          <dt className="text-muted-foreground">App name</dt><dd>{mobileConfig.name}</dd>
          <dt className="text-muted-foreground">App source</dt><dd className="break-all">{mobileConfig.sourceUrl}</dd>
          <dt className="text-muted-foreground">Proposed bundle / package ID</dt><dd>{mobileConfig.proposedBundleId} — reserve in your accounts before using; not yet confirmed</dd>
          <dt className="text-muted-foreground">OneSignal App ID</dt><dd className="break-all">{mobileConfig.oneSignalAppId}</dd>
        </dl>
        <p>Use the same identifier in Despia, Apple and Firebase Android. Disable automatic push registration in Despia so crew choose “Enable job alerts” from the notification bell. Native setting changes require a new build.</p>
      </section>
      <section className="space-y-3 border-b border-border pb-6">
        <h2 className="text-xl font-semibold">2. Icons</h2>
        <div className="grid gap-5 sm:grid-cols-3">{[
          ["ios-icon", "iOS / Despia", "1024 × 1024"], ["android-icon", "Android / Despia", "1024 × 1024"], ["google-play-icon", "Google Play listing", "512 × 512"],
        ].map(([file, label, size]) => <div key={file} className="space-y-2">
          <img src={`/mobile/${file}.png`} alt={`${label} Book a Crew icon`} className="h-32 w-32 border border-border object-contain" />
          <p className="font-semibold">{label} · {size}</p>
          <Button variant="outline" size="sm" asChild><a href={`/mobile/${file}.png`} download><Download className="h-4 w-4" />Download icon</a></Button>
        </div>)}</div>
        <p>Opaque PNGs prepared from your supplied logo. Upload both iOS and Android icons in Despia. Preview the Android safe area before building; icons have no pre-rounded corners.</p>
      </section>
      <section className="space-y-3 border-b border-border pb-6">
        <h2 className="text-xl font-semibold">3. Apple signing and iOS push</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Use the client’s Apple Developer organisation and App Store Connect accounts. Register the core bundle ID with Push Notifications enabled.</li>
          <li>Register <code className="break-all">film.bookacrew.app.OneSignalNotificationServiceExtension</code> and shared App Group <code className="break-all">group.film.bookacrew.app.onesignal</code> (replace if your core ID differs). Follow Despia’s build page for any other enabled extensions.</li>
          <li>In Apple Developer, create an APNs key. Upload its .p8 file, Key ID and Team ID to OneSignal’s Native iOS settings—not here. This is the push key, not the store-upload key.</li>
          <li>Create an App Store Connect API key with the App Manager role. In Despia: Publish → iOS → Build Settings → Add Development Team, supply the .p8 file, Key ID and Issuer ID. Despia handles signing and TestFlight upload.</li>
          <li>Create the Book a Crew listing using the same bundle ID. Build, test on a real iPhone through TestFlight, then submit for review.</li>
        </ol>
        <Button variant="link" asChild><a href="https://setup.despia.com/deployment/apple-ios/automatic" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Despia iOS guide</a></Button>
      </section>
      <section className="space-y-3 border-b border-border pb-6">
        <h2 className="text-xl font-semibold">4. Android signing and Firebase</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Register an Android app in your connected Firebase project using the exact Despia package ID. Configure Firebase Cloud Messaging HTTP v1 credentials in OneSignal’s Native Android settings. The Lovable Firebase connection alone does not configure OneSignal.</li>
          <li>Set the OneSignal App ID above in Despia. Build an APK for device testing and a signed AAB for Google Play.</li>
          <li>Enable Play App Signing, keep the upload key under the client’s control and retain a secure backup. Future Despia builds must use the same upload key; confirm its export/reuse options before the first upload.</li>
          <li>Create the Play Console listing with the matching package ID. Upload the AAB to Internal testing. Despia’s published guide uses manual upload; automatic Play account connection is not configured here.</li>
        </ol>
        <Button variant="link" asChild><a href="https://setup.despia.com/deployment/google-android/automatic" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Despia Android guide</a></Button>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">5. Release checks</h2>
        <p>New assigned gig offers, offer negotiations, booking/payment updates and production/location schedule changes create private job alerts. Lock-screen messages omit rates and addresses. Enabling alerts only checks permission and account linking—not delivery. Public marketplace posts are not broadcast to everyone.</p>
        <p>Test permission allowed/denied, sign-out, switching accounts, cold-start notification taps and foreground/background delivery on both devices. Tap opens the protected job page; crew still acknowledge inside the app. Network failures remain queued for a producer to retry here, up to four attempts; automatic delayed retries are not enabled.</p>
        <p>Store accounts, reserved IDs, signing and device delivery remain unverified. Supply store screenshots, support contact, privacy policy, data-safety answers (location, notifications, files and account data), account deletion and a review account. Verify native Google sign-in and Apple’s sign-in requirements before submission.</p>
      </section>
    </div>
  </Page>;
}