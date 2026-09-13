import SiteShell from "../components/SiteShell";
import { emails } from "../data/site";

/**
 * Privacy policy, in plain language and specific to what this site actually
 * does. Keep it true: update it (and UPDATED) whenever data handling changes —
 * a new tracker, a new kind of email, a new service that receives customer data.
 * Meta's Business Tools terms require this notice while the Meta Pixel runs.
 */
const UPDATED = "September 12, 2026";

export default function Privacy() {
  return (
    <SiteShell section="nc">
      <article className="legal">
        <header className="legal__head">
          <h1 className="page-title">Privacy</h1>
          <span className="label">Updated {UPDATED}</span>
        </header>

        <p>
          This covers no-connection.com: the NO CONNECTION shop and the KYD pages. It explains what we
          collect, why, and who else sees it.
        </p>

        <section>
          <h2 className="label">What we collect</h2>
          <ul>
            <li>
              <strong>When you order:</strong> your name, email, shipping address, what you bought
              (including sizes) and the total. We also keep the type of browser you ordered from with the
              order. Payments, including Apple Pay and Google Pay, are handled by Stripe. Your card details
              go to Stripe, not to us.
            </li>
            <li>
              <strong>If you make an account:</strong> your email, name, password (stored only as a secure
              hash, never the password itself), saved shipping address and order history.
            </li>
            <li>
              <strong>If you ask to hear when a piece comes back:</strong> your email, your name if you give
              it, and which piece.
            </li>
            <li>
              <strong>As you browse:</strong> the pages and products you view, what you add to your cart,
              and when you start checkout or buy, through the Meta Pixel (see below). Cloudflare, which
              delivers the site, counts visits for traffic stats without using cookies. Like any website,
              our hosting providers log basic request details, such as IP addresses, to keep the site
              running and secure.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="label">How we use it</h2>
          <ul>
            <li>To take payment, ship your order and send your receipt.</li>
            <li>To run your account and remember your shipping address.</li>
            <li>To send the emails listed below.</li>
            <li>To understand what’s working on the site, and to measure and improve our ads.</li>
            <li>To keep the site and checkout secure and prevent fraud.</li>
          </ul>
        </section>

        <section>
          <h2 className="label">Emails</h2>
          <ul>
            <li>Receipts and messages about your order.</li>
            <li>A message when a piece you asked about comes back.</li>
            <li>
              If you have an account: a heads-up about a day before a drop, and a reminder if you leave
              items in your cart while signed in.
            </li>
          </ul>
          <p>
            To stop drop and cart emails, write to <a href={`mailto:${emails.hello}`}>{emails.hello}</a>.
          </p>
        </section>

        <section>
          <h2 className="label">Meta Pixel</h2>
          <p>
            We use the Meta Pixel, a tool from Meta, the company behind Facebook and Instagram. It tells
            Meta which pages and products you view, what you add to your cart, when you start checkout, and
            what you buy and for how much. Meta uses cookies and similar technology to do this and may link
            the activity to your Facebook or Instagram account. We use it to measure our ads and to show our
            pieces to people who’ve shown interest, on Facebook and Instagram.
          </p>
          <p>
            Meta handles this information under its own{" "}
            <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noreferrer">
              privacy policy
            </a>
            . You can limit it through the ad preferences in Meta’s Accounts Center, your browser’s cookie
            settings, or a tracker blocker.
          </p>
        </section>

        <section>
          <h2 className="label">Who else sees it</h2>
          <p>Only what each service needs to do its job:</p>
          <ul>
            <li>Stripe, for payments.</li>
            <li>Meta, for the pixel activity described above.</li>
            <li>Cloudflare, which delivers and protects the site and counts visits.</li>
            <li>Netlify and Render, which host the site, the shop’s server and its database.</li>
            <li>Our email provider, to send our emails.</li>
            <li>The carrier that delivers your order.</li>
            <li>Authorities, if the law requires it.</li>
          </ul>
          <p>
            We don’t sell your personal information for money. Sharing browsing activity with Meta for
            advertising can count as “sharing” or “targeted advertising” under some US state privacy laws;
            see Your choices.
          </p>
        </section>

        <section>
          <h2 className="label">Cookies and storage</h2>
          <ul>
            <li>A cart cookie that holds your cart for 30 minutes.</li>
            <li>
              In your browser’s storage: a cart ID, a sign-in token while you’re signed in, and a copy of
              the product list so the shop loads quickly.
            </li>
            <li>Meta’s cookies from the pixel.</li>
          </ul>
        </section>

        <section>
          <h2 className="label">How long we keep it</h2>
          <ul>
            <li>Orders: as long as we need them for the business, taxes and returns.</li>
            <li>Accounts: until you ask us to delete yours.</li>
            <li>Comeback alerts: until they’re no longer needed, or you ask us to remove them.</li>
          </ul>
        </section>

        <section>
          <h2 className="label">Your choices</h2>
          <ul>
            <li>
              Write to <a href={`mailto:${emails.hello}`}>{emails.hello}</a> to see, correct or delete the
              information we have about you, or to stop drop and cart emails. We may have to keep some order
              records by law.
            </li>
            <li>
              Depending on where you live, you may have other rights, such as opting out of targeted
              advertising. Write to us and we’ll help.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="label">Children</h2>
          <p>This site isn’t meant for children under 13, and we don’t knowingly collect their information.</p>
        </section>

        <section>
          <h2 className="label">Changes</h2>
          <p>If this policy changes, we’ll update this page and the date at the top.</p>
        </section>

        <section>
          <h2 className="label">Contact</h2>
          <p>
            Questions: <a href={`mailto:${emails.hello}`}>{emails.hello}</a>. Order problems:{" "}
            <a href={`mailto:${emails.orders}`}>{emails.orders}</a>.
          </p>
        </section>
      </article>
    </SiteShell>
  );
}
