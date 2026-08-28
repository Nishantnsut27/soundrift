import { useEffect } from 'react';
import './../styles/legal.css';

export type LegalPageType = 'terms' | 'privacy';

const EFFECTIVE_DATE = 'August 28, 2026';
const CONTACT_EMAIL = 'contactsoundrift@gmail.com';
const APP_NAME = 'Soundrift';

interface LegalPageProps {
  page: LegalPageType;
}

function LegalPageHeader() {
  return (
    <header className="legal-header">
      <a className="legal-back" href="/" aria-label="Back to Soundrift">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12,19 5,12 12,5" />
        </svg>
        Back to {APP_NAME}
      </a>
      <div className="legal-brand">{APP_NAME}</div>
    </header>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      <div className="legal-section-body">{children}</div>
    </section>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function LegalPage({ page }: LegalPageProps) {
  useEffect(() => {
    document.title = `${APP_NAME} — ${page === 'terms' ? 'Terms of Service' : 'Privacy Policy'}`;
  }, [page]);

  return (
    <div className="legal-page">
      <LegalPageHeader />

      <div className="legal-container">
        <main className="legal-content">
          {page === 'terms' ? (
            <>
              <h1>Terms of Service</h1>
              <p className="legal-effective">Effective Date: {EFFECTIVE_DATE}</p>

              <Section title="1. Introduction">
                <Paragraph>
                  Welcome to {APP_NAME}, a music discovery and streaming platform. These Terms of Service
                  (&quot;Terms&quot;) govern your access to and use of the {APP_NAME} website, mobile experience,
                  and related services (collectively, the &quot;Service&quot;). By accessing or using the Service,
                  you agree to be bound by these Terms. If you do not agree, please do not use the Service.
                </Paragraph>
              </Section>

              <Section title="2. Acceptance of Terms">
                <Paragraph>
                  By creating an account, browsing the Service, or otherwise using any part of the Service, you
                  accept these Terms and agree to comply with them. Your continued use of the Service after any
                  changes to these Terms constitutes acceptance of the updated Terms.
                </Paragraph>
              </Section>

              <Section title="3. Eligibility">
                <Paragraph>
                  To use the Service, you must be at least the age of majority in your jurisdiction, or have the
                  permission of a parent or legal guardian. By using the Service, you represent that you meet these
                  eligibility requirements and that the information you provide is accurate.
                </Paragraph>
              </Section>

              <Section title="4. Account Registration">
                <Paragraph>
                  You may register for an account using an email address and a password, or, where offered, by
                  signing in with a supported third-party provider such as Google. You are responsible for providing
                  accurate and complete information during registration and for keeping your account information
                  up to date. You may not create accounts using false or misleading identities.
                </Paragraph>
              </Section>

              <Section title="5. Account Security">
                <Paragraph>
                  You are responsible for maintaining the confidentiality of your account credentials and for all
                  activity that occurs under your account. You agree to notify us promptly if you suspect any
                  unauthorized access to your account. We are not liable for losses arising from your failure to
                  safeguard your credentials.
                </Paragraph>
              </Section>

              <Section title="6. Google OAuth / Third-Party Authentication">
                <Paragraph>
                  {APP_NAME} may allow you to sign in or register using your Google account. When you choose to do
                  so, Google will share with us limited information about your account, such as your Google account
                  identifier, email address, name, and profile picture, as described in our Privacy Policy. We use
                  this information solely to create and authenticate your {APP_NAME} account. Your use of Google
                  authentication is also governed by Google&apos;s own terms and privacy policy.
                </Paragraph>
              </Section>

              <Section title="7. Use of Soundrift">
                <Paragraph>
                  {APP_NAME} provides tools to search for and discover music, view details about songs, albums,
                  artists, and playlists, create playlists, save favorites, and track recently played or listening
                  history. Available functionality may vary and may change over time. The Service is provided for
                  your personal, non-commercial use.
                </Paragraph>
              </Section>

              <Section title="8. Music and Third-Party Content">
                <Paragraph>
                  The music, audio, artwork, lyrics, and related metadata available through the Service are provided
                  by third-party music providers and are the property of their respective owners and licensors.
                  {APP_NAME} does not claim ownership of third-party content. Availability of any song, artist, or
                  album depends on these third-party providers and may change without notice.
                </Paragraph>
              </Section>

              <Section title="9. User Responsibilities">
                <Paragraph>
                  You agree to use the Service lawfully and to respect the rights of {APP_NAME} and third parties.
                  You are solely responsible for the content you create, such as playlists, and for any activity
                  performed using your account.
                </Paragraph>
              </Section>

              <Section title="10. Prohibited Activities">
                <Paragraph>You agree not to, and not to attempt to:</Paragraph>
                <List
                  items={[
                    <>Use the Service for any unlawful purpose or in violation of these Terms.</>,
                    <>Attempt to gain unauthorized access to any part of the Service, other users&apos; accounts, or our systems.</>,
                    <>Interfere with, disrupt, or overload the Service or its infrastructure.</>,
                    <>Scrape, harvest, or otherwise collect data from the Service without authorization.</>,
                    <>Impersonate any person or entity or misrepresent your affiliation.</>,
                    <>Reverse engineer, decompile, or attempt to derive the source code of the Service.</>,
                  ]}
                />
              </Section>

              <Section title="11. Intellectual Property">
                <Paragraph>
                  The {APP_NAME} name, logo, and the text, graphics, and interface elements that we create and
                  control are protected by applicable intellectual property laws. Third-party music content remains
                  the property of its respective owners. Nothing in these Terms grants you any rights to third-party
                  content beyond the limited rights necessary to use the Service as intended.
                </Paragraph>
              </Section>

              <Section title="12. Third-Party Services">
                <Paragraph>
                  The Service relies on third-party providers for music content and related features, and may use
                  third-party services for storage and other functions. These third parties have their own terms and
                  privacy policies. {APP_NAME} is not responsible for the practices of third-party providers and
                  does not control the availability of their services.
                </Paragraph>
              </Section>

              <Section title="13. Availability of the Service">
                <Paragraph>
                  We aim to keep the Service available, but it may be interrupted due to maintenance, technical
                  issues, or factors beyond our control. We may modify, suspend, or discontinue any part of the
                  Service at any time and without notice.
                </Paragraph>
              </Section>

              <Section title="14. Account Suspension or Termination">
                <Paragraph>
                  We may suspend or terminate your account or access to the Service if you violate these Terms, if
                  we reasonably believe your use creates a security risk or legal liability, or as required by law.
                  You may stop using the Service at any time. Provisions of these Terms that by their nature should
                  survive termination will survive.
                </Paragraph>
              </Section>

              <Section title="15. Disclaimers">
                <Paragraph>
                  The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis, without
                  warranties of any kind, whether express or implied. To the maximum extent permitted by applicable
                  law, {APP_NAME} disclaims all warranties, including implied warranties of merchantability, fitness
                  for a particular purpose, and non-infringement. We do not warrant that the Service will be
                  uninterrupted, error-free, or free of harmful components.
                </Paragraph>
              </Section>

              <Section title="16. Limitation of Liability">
                <Paragraph>
                  To the maximum extent permitted by applicable law, {APP_NAME} and its operators shall not be
                  liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of
                  profits or data, arising out of or related to your use of the Service, even if advised of the
                  possibility of such damages. Some jurisdictions do not allow the exclusion of certain warranties
                  or the limitation of certain damages, so some of these limitations may not apply to you.
                </Paragraph>
              </Section>

              <Section title="17. Changes to These Terms">
                <Paragraph>
                  We may update these Terms from time to time. When we do, we will revise the Effective Date above.
                  Your continued use of the Service after changes take effect constitutes acceptance of the updated
                  Terms. We encourage you to review these Terms periodically.
                </Paragraph>
              </Section>

              <Section title="18. Contact Information">
                <Paragraph>
                  If you have questions about these Terms, please contact us at{" "}
                  <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>.
                </Paragraph>
              </Section>
            </>
          ) : (
            <>
              <h1>Privacy Policy</h1>
              <p className="legal-effective">Effective Date: {EFFECTIVE_DATE}</p>

              <Section title="1. Introduction">
                <Paragraph>
                  {APP_NAME} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) provides a music discovery and
                  streaming platform. This Privacy Policy explains what information we collect, how we use it, and
                  the choices available to you. By using the Service, you agree to the collection and use of
                  information as described in this policy.
                </Paragraph>
              </Section>

              <Section title="2. Information We Collect">
                <Paragraph>Depending on how you use the Service, we may collect the following categories of information:</Paragraph>
                <List
                  items={[
                    <>
                      <strong>Account information.</strong> Your name, email address, and, if you sign up with a
                      password, a securely hashed version of your password.
                    </>,
                    <>
                      <strong>Profile information.</strong> An optional profile or avatar image that you choose to
                      upload.
                    </>,
                    <>
                      <strong>Authentication information.</strong> Information related to email verification, your
                      account status, and the date of your last login.
                    </>,
                    <>
                      <strong>Your content and usage.</strong> Playlists you create, tracks you save as favorites,
                      and information about tracks you recently played or listened to.
                    </>,
                    <>
                      <strong>Search information.</strong> The search queries you submit so we can provide search
                      history features.
                    </>,
                    <>
                      <strong>Device and technical information.</strong> Standard technical details that may be
                      collected when you access the Service, such as request information.
                    </>,
                  ]}
                />
              </Section>

              <Section title="3. Authentication with Google">
                <Paragraph>
                  You may choose to register or sign in using your Google account. When you do, we request only the
                  authentication information needed to create and sign in to your {APP_NAME} account. With your
                  consent, we may receive from Google:
                </Paragraph>
                <List
                  items={[
                    <>Your Google account identifier (a unique value that lets us recognize your account).</>,
                    <>Your email address.</>,
                    <>Your name.</>,
                    <>Your profile picture.</>,
                    <>Verification that your email address is associated with a Google account.</>,
                  ]}
                />
                <Paragraph>
                  We store a Google account identifier and, where applicable, your email, name, and profile picture,
                  in order to link your Google sign-in to your {APP_NAME} account and to display your profile. We
                  do not store Google access tokens or refresh tokens. We do not request or access your Gmail,
                  Google Drive, Google Calendar, contacts, YouTube, or any other Google services as part of
                  authentication.
                </Paragraph>
              </Section>

              <Section title="4. How We Use Your Information">
                <Paragraph>We use the information we collect to:</Paragraph>
                <List
                  items={[
                    <>Create and manage your account and authenticate your identity.</>,
                    <>Provide, operate, and improve the Service, including personalized features such as favorites and playlists.</>,
                    <>Send you transactional emails, such as account verification and password reset messages.</>,
                    <>Maintain the security of your account and the Service.</>,
                    <>Respond to your inquiries and provide support.</>,
                  ]}
                />
              </Section>

              <Section title="5. Cookies and Authentication">
                <Paragraph>
                  We use cookies and similar technologies to keep you signed in and to maintain your session. For
                  example, we set authentication cookies that store session tokens so you do not have to sign in
                  again on each visit. These cookies are described by their purpose and do not expose the underlying
                  token values or secrets. You can generally control or delete cookies through your browser, although
                  doing so may affect your ability to stay signed in.
                </Paragraph>
              </Section>

              <Section title="6. Local Storage in Your Browser">
                <Paragraph>
                  We may use browser storage such as localStorage to remember certain preferences and cached data so
                  the Service works smoothly. This information generally stays on your device.
                </Paragraph>
              </Section>

              <Section title="7. Music Providers and Third-Party Services">
                <Paragraph>
                  To provide search, playback, and discovery, the Service interacts with third-party music providers
                  and related services. These interactions occur so we can retrieve music content and metadata on
                  your behalf. These third parties operate under their own terms and privacy policies, and we do not
                  control their practices. When you sign in with Google, Google&apos;s privacy policy also applies to
                  the information Google processes.
                </Paragraph>
              </Section>

              <Section title="8. Where Information Is Stored">
                <Paragraph>
                  Account information and your content (such as playlists, favorites, and history) are stored in a
                  database operated by our hosting infrastructure. Avatar images may be stored with a third-party
                  image storage provider. Transactional emails, such as verification codes, are sent through a
                  third-party email service. These service providers process information only as needed to provide
                  their services to us.
                </Paragraph>
              </Section>

              <Section title="9. Analytics and Logging">
                <Paragraph>
                  We do not currently use third-party analytics, advertising, or marketing tracking on the Service.
                  We may maintain basic technical logs to operate, troubleshoot, and secure the Service.
                </Paragraph>
              </Section>

              <Section title="10. How We Protect Information">
                <Paragraph>
                  We take reasonable measures to help protect the information we hold, including using secure,
                  industry-standard practices for authentication and storage. Passwords are stored only in hashed
                  form. No method of transmission or storage is completely secure, and we cannot guarantee absolute
                  security.
                </Paragraph>
              </Section>

              <Section title="11. Data Retention">
                <Paragraph>
                  We retain your account information and content for as long as your account remains active, and
                  thereafter as needed to comply with legal obligations or resolve disputes. Specific retention
                  periods may be established from time to time as part of our operational practices.
                </Paragraph>
              </Section>

              <Section title="12. Your Rights and Choices">
                <Paragraph>
                  You may access and manage some of your information directly through the Service, such as viewing or
                  clearing your favorites, playlists, recently played tracks, listening history, and search history.
                  You may also contact us to request access to, correction of, or deletion of your personal
                  information or to ask questions about your data or privacy.
                </Paragraph>
              </Section>

              <Section title="13. Children&apos;s Privacy">
                <Paragraph>
                  The Service is not directed to children, and we do not knowingly collect personal information from
                  children. If you believe a child has provided us personal information, please contact us and we
                  will take steps to remove it.
                </Paragraph>
              </Section>

              <Section title="14. Changes to This Privacy Policy">
                <Paragraph>
                  We may update this Privacy Policy from time to time. When we do, we will revise the Effective Date
                  above. We encourage you to review this policy periodically to stay informed of how we handle your
                  information.
                </Paragraph>
              </Section>

              <Section title="15. Contact Us">
                <Paragraph>
                  If you have questions about this Privacy Policy or about your data, please contact us at{" "}
                  <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>.
                </Paragraph>
              </Section>
            </>
          )}

          <footer className="legal-footer">
            <span>{APP_NAME} — Terms &amp; Privacy</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
