// components/site/footer.tsx
//
// Renders the LITERAL markup from al-ai.ai-pages/index.html's <footer
// id="tt-footer"> — not a Tailwind re-approximation, same reasoning as the
// other al-ai.ai-pages components (see navbar.tsx's header comment):
// theme-black.css only styles elements bearing these exact tt-footer-*
// class names.
//
// Content split, deliberately:
//  - Logo, site description, social links, and the "Services" column stay
//    CMS-editable (settings.logo/siteDescription/socialLinks, and the
//    `footer` navigation location seeded by migration/seed-al-ai-nav.ts).
//  - The two address/phone blocks ("Partners": KSA + UAE, "Contact":
//    Jordan + Arizona) are the source's own real company data, not
//    generic placeholder fields the `settings` schema has room for — same
//    reasoning as navbar.tsx's hardcoded PARTNER_BADGE_URL. If these ever
//    need to be admin-editable, they belong in new settings columns, not
//    guessed into existing ones.
import Image from 'next/image';
import type { NavItem } from './navbar';
import type { SiteSettings } from '@/lib/db/queries';

const COPY = {
  ar: { rights: 'جميع الحقوق محفوظة' },
  en: { rights: 'All Rights Reserved' },
} as const;

const SOCIAL_ICONS: Record<string, string> = {
  facebook: 'fa-facebook-f',
  instagram: 'fa-instagram',
  linkedin: 'fa-linkedin',
  youtube: 'fa-youtube',
  twitter: 'fa-x-twitter',
  x: 'fa-x-twitter',
};

interface FooterProps {
  /** `footer`-location nav rows — the Services column's 6 links. */
  navigation: NavItem[];
  settings: SiteSettings | null;
  locale: 'ar' | 'en';
}

export function Footer({ navigation, settings, locale }: FooterProps) {
  const currentYear = new Date().getFullYear();
  const copy = COPY[locale];
  const social = (settings?.socialLinks ?? {}) as Partial<Record<string, string>>;
  const socialEntries = Object.entries(social).filter(
    (entry): entry is [string, string] => Boolean(entry[1]) && Boolean(SOCIAL_ICONS[entry[0]])
  );

  return (
    <footer id="tt-footer" className="border-top max-width-1500" style={{ paddingBottom: 0 }}>
      <div className="tt-footer-inner tt-wrap">
        <div className="tt-row">
          <div className="tt-col-xl-3 tt-col-sm-6">
            <div className="tt-footer-widget">
              <ul className="tt-footer-widget-list">
                <li>
                  <div className="tt-footer-logo">
                    <a href={`/${locale}`} className="tt-magnetic-item">
                      {settings?.logo ? (
                        <>
                          <Image src={settings.logo} alt={settings.siteName ?? ''} width={160} height={40} loading="lazy" className="tt-logo-light" />
                          <Image src={settings.logo} alt={settings.siteName ?? ''} width={160} height={40} loading="lazy" className="tt-logo-dark" />
                        </>
                      ) : (
                        <span className="text-xl font-bold">{settings?.siteName}</span>
                      )}
                    </a>
                  </div>
                </li>
                {settings?.siteDescription && (
                  <li>
                    <p>{settings.siteDescription}</p>
                  </li>
                )}
                {socialEntries.length > 0 && (
                  <li>
                    <div className="tt-social-buttons">
                      <ul>
                        {socialEntries.map(([key, url]) => (
                          <li key={key}>
                            <a href={url} className="tt-magnetic-item" target="_blank" rel="noopener">
                              <i className={`fa-brands ${SOCIAL_ICONS[key]}`} />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="tt-col-xl-3 tt-col-sm-6">
            <div className="tt-footer-widget">
              <h5 className="tt-footer-widget-heading">Partners</h5>
              <ul className="tt-footer-widget-list">
                <li>Kingdom of Saudi Arabia - Riyadh - King Fahd Road, Al Olaya District</li>
                <li><a href="tel:+966568872222" className="tt-link"> +(966) 56 887 2222</a></li>
                <li>UAE - Office 01, Al Dana Bay, Sharm, Fujairah</li>
                <li><a href="tel:+971566016681" className="tt-link"> +(971) 56 601 6681</a></li>
              </ul>
            </div>
          </div>

          <div className="tt-col-xl-3 tt-col-sm-6">
            <div className="tt-footer-widget">
              <h5 className="tt-footer-widget-heading">Services</h5>
              <ul className="tt-footer-widget-list">
                {navigation.map((item) => (
                  <li key={item.id}>
                    <a className="tt-link" style={{ textTransform: 'capitalize' }} href={`/${locale}${item.url.startsWith('/') ? item.url : `/${item.url}`}`}>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="tt-col-xl-3 tt-col-sm-6">
            <div className="tt-footer-widget">
              <h5 className="tt-footer-widget-heading">Contact</h5>
              <ul className="tt-footer-widget-list">
                <li>Jordan - Dabooq</li>
                <li><a href="tel:+96265931029" className="tt-link"> +(962) 659 310 29</a></li>
                <li>Arizona - Phoenix</li>
                <li><a href="tel:+14807440848" className="tt-link"> +1(480) 744 0848</a></li>
                {settings?.contactEmail && (
                  <li>
                    <a href={`mailto:${settings.contactEmail}`} className="tt-link" style={{ textTransform: 'capitalize' }}>
                      {settings.contactEmail}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="tt-footer-inner tt-wrap max-width-1500 border-top" style={{ marginTop: 50 }}>
        <div className="tt-row copyRights">
          <div className="tt-col-xl-6 tt-col-sm-12">
            <div className="tt-footer-widget">
              &copy; {currentYear} {settings?.siteName ?? ''} {copy.rights}
            </div>
          </div>

          <div className="tt-col-xl-6 tt-col-sm-12">
            <div className="tt-footer-widget text-right">
              <a href={`/${locale}/privacy-policy`} className="tt-link">Privacy Policy</a> |{' '}
              <a href={`/${locale}/terms-and-conditions`} className="tt-link">Terms &amp; Conditions</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
