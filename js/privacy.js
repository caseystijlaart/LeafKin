// LeafKin's privacy policy, shown inside the app (Settings, the start screen and Create account).
// Change PRIVACY_VERSION whenever the text changes in substance; new accounts store the version they accepted.
import { esc } from "./util.js";

export const PRIVACY_VERSION = "2026-10-23";
export const CONTACT = "leafkinapp@outlook.com";
const OWNER = "Casey Stijlaart";

export function privacyHtml() {
  const updated = new Date(PRIVACY_VERSION).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `
  <div class="policy">
    <p class="muted">Last updated ${esc(updated)}</p>
    <p>LeafKin is a personal, non-commercial app made by ${esc(OWNER)} in the Netherlands, who is responsible for your data. Questions or requests: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>

    <h3>In short</h3>
    <ul>
      <li>LeafKin only stores what it needs to work: your plants and the account to share them.</li>
      <li>No ads, no tracking, no analytics. Your data is never sold or shared for marketing.</li>
      <li>You can delete your account and everything in it yourself, in Settings.</li>
    </ul>

    <h3>Guests</h3>
    <p>If you continue as a guest, nothing is stored on LeafKin's servers. Your plants, photos and settings stay in this phone's browser storage only. Deleting the app or clearing Safari's website data removes them. The only things that leave your phone are photos you choose to scan (see Plant scanning).</p>

    <h3>What is stored with an account</h3>
    <ul>
      <li><b>Account:</b> your email address, the name you choose, and when you accepted this policy. Signing in works with a code sent by email; there's no password.</li>
      <li><b>Your household:</b> its name, who is in it, your plants and their care settings, the care log (who watered or fed what, and when), growth timeline entries with photos and heights, and health checks.</li>
      <li><b>Reminders</b> (only if you turn them on): a notification address for each device, the time you picked and your time zone.</li>
      <li><b>On your phone:</b> a copy of your plants and photos so LeafKin works offline, and your settings.</li>
    </ul>
    <p>Everyone in your household can see the household's plants, photos and care log, including who did what. Nobody else can.</p>

    <h3>Why</h3>
    <p>This data is used only to run LeafKin for you: sign you in, show and sync your plants, share them with your household and send the reminders you asked for. The legal basis is providing the service you signed up for (GDPR article 6(1)(b)).</p>

    <h3>Who processes it</h3>
    <ul>
      <li><b>Supabase</b>: database, sign-in, photo storage and reminders. Servers in Europe.</li>
      <li><b>Brevo</b> (France): sends the sign-in code emails, so it receives your email address.</li>
      <li><b>Apple / your browser's push service</b>: delivers reminder notifications to your device.</li>
      <li><b>GitHub Pages</b>: hosts the app's files. Like any website host, it sees your IP address when the app loads.</li>
      <li><b>Pl@ntNet</b> (France): see Plant scanning.</li>
    </ul>
    <p>The fonts and everything else the app needs come with the app itself; LeafKin doesn't load anything from Google or other third parties.</p>

    <h3>Photo health check</h3>
    <p>When you check a plant's health with a photo, the photo is analysed on your phone by a small model that comes with
    the app. That photo isn't sent anywhere for the check. If you choose to add it to the timeline, it's stored like any
    other timeline photo.</p>

    <h3>Plant scanning</h3>
    <p>When you scan a plant, that photo is sent to Pl@ntNet to identify it, and the reference photos in the results are loaded from Pl@ntNet. The scan photo isn't stored by LeafKin unless you add it to the timeline. This applies to guests too.</p>

    <h3>How long</h3>
    <ul>
      <li>Your data is kept as long as you have an account.</li>
      <li><b>Delete account</b> in Settings removes your account, your profile and your devices straight away. If you were the last member of your household, the household, its plants and all its photos are deleted too. If others remain, the plants stay with them and your care log entries no longer show your name.</li>
      <li>Leaving a household removes your access to it; the household stays for the others.</li>
    </ul>

    <h3>Your rights</h3>
    <p>You can see, correct, export (Settings → Backup) and delete your data. For anything else, such as a copy of everything stored about you, email <a href="mailto:${CONTACT}">${CONTACT}</a>. If you're not happy with how your data is handled, you can complain to the Dutch data protection authority, the Autoriteit Persoonsgegevens.</p>

    <h3>Changes</h3>
    <p>If this policy changes in a way that matters, LeafKin will tell you in the app.</p>
  </div>`;
}
