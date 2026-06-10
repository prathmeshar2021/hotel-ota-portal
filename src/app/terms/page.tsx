import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { Section, P, Bullets } from "@/components/customer/LegalShell";
import { BUSINESS } from "@/lib/constants/business";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: `Terms and conditions for booking with ${BUSINESS.brand}.`,
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms & Conditions" lastUpdated={BUSINESS.policiesUpdated}>
      <Section title="1. Introduction">
        <P>
          These Terms &amp; Conditions govern your use of the {BUSINESS.brand} booking
          website and the booking of accommodation operated by {BUSINESS.legalName}{" "}
          ({BUSINESS.entityType}), located at {BUSINESS.addressLines.join(", ")}. By
          accessing this website or making a booking, you agree to these terms.
        </P>
      </Section>

      <Section title="2. Bookings & Confirmation">
        <Bullets
          items={[
            "A booking is confirmed only after you receive a confirmation (on-screen and/or via WhatsApp/email) with a booking reference.",
            "You are responsible for providing accurate guest details, contact number and valid government ID. Incorrect details may lead to denial of check-in.",
            "The specific room/unit is assigned by our team and may differ from images, which are indicative.",
            "We reserve the right to decline or cancel a booking in case of suspected fraud, payment failure, or unavailability, with a full refund of amounts paid.",
          ]}
        />
      </Section>

      <Section title="3. Pricing & Payment">
        <Bullets
          items={[
            "All prices are in Indian Rupees (₹) and, where applicable, inclusive of taxes (GST) as shown at checkout.",
            "A refundable security deposit of ₹200 is collected with every booking and refunded at check-out, subject to no damage to property.",
            "Payments are processed securely through Razorpay. We do not store your card or banking details.",
            "“Pay at Hotel” bookings reserve your room; the balance is collected in cash or UPI at check-in.",
          ]}
        />
      </Section>

      <Section title="4. Check-in & Check-out">
        <Bullets
          items={[
            `Standard check-in is from ${BUSINESS.checkInTime} and check-out by ${BUSINESS.checkOutTime}. Early check-in / late check-out is subject to availability.`,
            "A valid government-issued photo ID is mandatory for every guest at check-in, as required by law.",
            "Guests must be 18 years or older to make a booking and check in.",
            "The number of guests must not exceed the booked room's capacity.",
          ]}
        />
      </Section>

      <Section title="5. Cancellations & Refunds">
        <P>
          Cancellations and refunds are governed by our{" "}
          <Link href="/refund-policy" className="text-amber-400 hover:text-amber-300 underline">
            Cancellation &amp; Refund Policy
          </Link>
          .
        </P>
      </Section>

      <Section title="6. Guest Conduct">
        <Bullets
          items={[
            "Guests are expected to conduct themselves responsibly and respect property, staff and other guests.",
            "Any damage to property may be charged and may be deducted from the security deposit or billed separately.",
            "Illegal activities, smoking in non-smoking areas, and excessive noise are prohibited and may result in eviction without refund.",
          ]}
        />
      </Section>

      <Section title="7. Liability">
        <P>
          {BUSINESS.brand} is not liable for loss or damage to guests&apos; personal
          belongings, or for events beyond our reasonable control (force majeure,
          natural events, government action). Our maximum liability for any claim is
          limited to the amount paid for the booking in question.
        </P>
      </Section>

      <Section title="8. Changes to These Terms">
        <P>
          We may update these terms from time to time. The version published on this
          page at the time of your booking applies to that booking.
        </P>
      </Section>

      <Section title="9. Contact">
        <P>
          For any questions about these terms, contact us at{" "}
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
