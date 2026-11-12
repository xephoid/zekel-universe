// The privacy policy and the terms of service, and the footer that links
// them from every page outside a game table. Plain boilerplate: what the
// site keeps, why, and the rules for using it.

import { Link, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Nav } from './Nav';

const UPDATED = 'November 12, 2026';
const ISSUES = 'https://github.com/xephoid/zekel-universe/issues';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>© Zekel Games</span>
      <nav aria-label="Site">
        <Link to="/privacy_policy">Privacy policy</Link>
        <Link to="/terms_of_service">Terms of service</Link>
      </nav>
    </footer>
  );
}

/** Pages outside a game table: the page, then the footer. */
export function WithFooter() {
  return (
    <div className="site">
      <div className="site-main"><Outlet /></div>
      <SiteFooter />
    </div>
  );
}

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <Nav />
      <article className="page narrow legal">
        <h1>{title}</h1>
        <p className="muted">Last updated {UPDATED}</p>
        {children}
      </article>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2>{heading}</h2>
      {children}
    </section>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        zekel.games is run by Zekel Games. This page says what we collect when you use the site,
        why, and what you can do about it. We keep as little as we can.
      </p>

      <Section heading="What we collect">
        <ul>
          <li><strong>Your account.</strong> If you sign in, we keep your email address and the display name you choose. If you sign in with Discord or Google, we receive your email address and account ID from that service through our sign-in provider, Supabase. We never see your password for those services.</li>
          <li><strong>Guest play.</strong> If you play without an account, we keep a random guest ID and the name you give, so you can come back to your tables.</li>
          <li><strong>Your games.</strong> The tables you join, the moves you make, and the results, so games can be played, resumed, and shown to the other players at the table.</li>
          <li><strong>Friends and invites.</strong> Who you have added as a friend and who you have invited to a table.</li>
          <li><strong>Technical information.</strong> Your IP address and basic request details, used to keep the site running and to limit abuse. Server logs are kept for a short time.</li>
          <li><strong>Usage information.</strong> We may collect simple, aggregate information about how the site is used, such as which pages are visited, to make the site better.</li>
        </ul>
      </Section>

      <Section heading="Cookies and local storage">
        <p>
          We use cookies only to keep you signed in, to remember your guest seat, and to make sign-in links
          work in the browser that asked for them. Your browser also stores small preferences on your device,
          such as light or dark mode. We do not use advertising cookies.
        </p>
      </Section>

      <Section heading="How we use it">
        <ul>
          <li>To run your games and show them to the players at your table.</li>
          <li>To send you sign-in links and, if you play by turns, a reminder when it is your turn.</li>
          <li>To keep the site secure and stop abuse.</li>
          <li>To understand how the site is used and improve it.</li>
        </ul>
        <p>We do not sell your information, and we do not use it for advertising.</p>
      </Section>

      <Section heading="Who we share it with">
        <p>
          Only the services that help us run the site: our hosting provider, our database, our email
          provider (to deliver sign-in links and turn reminders), and Supabase (if you sign in with Discord
          or Google). Each handles your information only to provide its service to us. We may also share
          information if the law requires it.
        </p>
        <p>
          Other players at your table see your display name and your moves. Hidden information, like the
          cards in your hand, stays hidden from them.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <p>
          We keep your account and game history while your account exists. Guest data that is not used for a
          long time may be removed. Sign-in links expire shortly after they are sent.
        </p>
      </Section>

      <Section heading="Your choices">
        <p>
          You can play as a guest without giving us an email address. You can ask us to show you, correct,
          or delete the information we hold about you. Deleting your account removes your email and name;
          past games may keep an anonymous record of the moves.
        </p>
      </Section>

      <Section heading="Children">
        <p>The site is not meant for children under 13, and we do not knowingly collect their information.</p>
      </Section>

      <Section heading="Changes">
        <p>If we change this policy, we will update it here and change the date at the top.</p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions or requests: <a href={ISSUES}>open an issue on our GitHub repository</a>. For anything
          private, say so in the issue and we will reply through a private channel. See also
          our <Link to="/terms_of_service">terms of service</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}

export function TermsOfServicePage() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms cover your use of zekel.games, run by Zekel Games. By using the site you agree to them.
        If you do not agree, please do not use the site.
      </p>

      <Section heading="The service">
        <p>
          zekel.games lets you play board games in your browser, against AI opponents or with other people,
          and lets game designers share their games. The site is free to use. We may change, pause, or stop
          any part of it at any time.
        </p>
      </Section>

      <Section heading="Your account">
        <ul>
          <li>You can play as a guest or sign in with an email link, Discord, or Google.</li>
          <li>Keep access to your email and sign-in accounts secure. You are responsible for what happens under your account.</li>
          <li>Choose a display name that is not offensive and does not pretend to be someone else.</li>
          <li>You must be at least 13 years old to use the site.</li>
        </ul>
      </Section>

      <Section heading="Acceptable use">
        <p>When you use the site, do not:</p>
        <ul>
          <li>Harass, threaten, or abuse other players.</li>
          <li>Cheat, or exploit bugs to gain an advantage or to spoil other players' games.</li>
          <li>Try to break into accounts, servers, or data that are not yours.</li>
          <li>Overload the site, scrape it heavily, or use automated tools in a way that harms it or other players.</li>
          <li>Use the site for anything illegal.</li>
        </ul>
        <p>We may suspend or remove accounts that break these rules.</p>
      </Section>

      <Section heading="Games and content">
        <p>
          The games on the site belong to their designers. The site's own source code is open source under the
          Apache 2.0 license; that license, not these terms, covers the code. Anything you post, such as a display
          name, you let us show on the site so it can work.
        </p>
      </Section>

      <Section heading="No warranty">
        <p>
          The site is provided "as is" and "as available", without warranties of any kind. We do not promise
          that it will always be available, free of errors, or that your games and data will never be lost.
        </p>
      </Section>

      <Section heading="Limitation of liability">
        <p>
          To the fullest extent the law allows, Zekel Games is not liable for any indirect, incidental, or
          consequential damages, or for any loss of data, arising from your use of the site.
        </p>
      </Section>

      <Section heading="Privacy">
        <p>How we handle your information is set out in our <Link to="/privacy_policy">privacy policy</Link>.</p>
      </Section>

      <Section heading="Changes">
        <p>
          We may update these terms. When we do, we will change the date at the top. Using the site after a
          change means you accept the new terms.
        </p>
      </Section>

      <Section heading="Contact">
        <p>Questions about these terms: <a href={ISSUES}>open an issue on our GitHub repository</a>.</p>
      </Section>
    </LegalPage>
  );
}
