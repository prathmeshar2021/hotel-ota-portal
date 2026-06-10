import type { Metadata } from "next";
import LegalShell, { Section, P, Bullets } from "@/components/customer/LegalShell";
import { BUSINESS } from "@/lib/constants/business";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${BUSINESS.brand} collects, uses and protects your personal information.`,
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" lastUpdated={BUSINESS.policiesUpdated}>
      <Section title="1. Overview">
        <P>
          {BUSINESS.legalName} ({BUSINESS.brand}) respects your privacy. This policy
          explains what information we collect when you use our booking website, why we
          collect it, and how we protect it.
        </P>
      </Section>

      <Section title="2. Information We Collect">
        <Bullets
          items={[
            "Contact & identity details: name, phone number, email, and government ID details/photos provided for check-in (as required by law).",
            "Booking details: stay dates, room category, number of guests, special requests and travel details.",
            "Payment information: processed by our payment gateway (Razorpay). We receive only a payment status/reference — we do not store your card or bank details.",
            "Technical data: basic device/usage information needed to operate and secure the site.",
          ]}
        />
      </Section>

      <Section title="3. How We Use Your Information">
        <Bullets
          items={[
            "To process and confirm your booking and check-in.",
            "To send booking confirmations and important updates via WhatsApp, SMS or email.",
            "To comply with legal obligations, including maintaining a guest register with valid ID.",
            "To prevent fraud and secure our services, and to respond to your enquiries.",
          ]}
        />
      </Section>

      <Section title="4. Sharing of Information">
        <P>
          We do not sell your personal information. We share it only with service
          providers who help us operate (e.g. Razorpay for payments, our messaging
          provider for confirmations), and with authorities where required by law.
        </P>
      </Section>

      <Section title="5. Data Retention & Security">
        <P>
          We retain booking and ID records for as long as required for our operations and
          to meet legal/tax obligations, after which they are deleted or anonymised. We
          use reasonable technical and organisational measures to protect your data;
          however, no online transmission is fully secure.
        </P>
      </Section>

      <Section title="6. Your Rights">
        <P>
          You may request access to, correction of, or deletion of your personal
          information (subject to legal retention requirements) by contacting us using the
          details below.
        </P>
      </Section>

      <Section title="7. Contact">
        <P>
          For privacy queries, contact us at{" "}
          <a href={BUSINESS.emailHref} className="text-amber-400 hover:text-amber-300">
            {BUSINESS.email}
          </a>{" "}
          or{" "}
          <a href={BUSINESS.phoneHref} className="text-amber-400 hover:text-amber-300">
            {BUSINESS.phone}
          </a>
          .
        </P>
      </Section>
    </LegalShell>
  );
}
