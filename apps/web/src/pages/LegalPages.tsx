import { LegalPage } from '../features/legal/LegalPage';
import { PRIVACY_POLICY, TERMS } from '../features/legal/content';

/** Public: `/privacy-policy`. */
export function PrivacyPolicyPage() {
  return <LegalPage document={PRIVACY_POLICY} path="/privacy-policy" />;
}

/** Public: `/terms`. */
export function TermsPage() {
  return <LegalPage document={TERMS} path="/terms" />;
}
