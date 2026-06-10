import type { Metadata } from "next";
import LegalShell, { Section, P, Bullets } from "@/components/customer/LegalShell";
import { BUSINESS } from "@/lib/constants/business";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy",
  description: `Cancellation tiers and refund timelines for ${BUSINESS.brand} bookings.`,
};

export default function RefundPolicyPage() {
  return (
    <LegalShell title="Cancellation & Refund Policy" lastUpdated={BUSINESS.policiesUpdated}>
      <Section title="Cancellation Charges">
        <P>
          You can cancel a confirmed booking from your bookings page. The charge depends
          on how far in advance you cancel, calculated on the room charges only:
        </P>
        <Bullets
          items={[
            <>
              <span className="text-green-400 font-semibold">More than 72 hours</span>{" "}
              before check-in — <span className="text-white/80">free cancellation</span>, full
              refund of room charges.
            </>,
            <>
              <span className="text-amber-400 font-semibold">Between 24 and 72 hours</span>{" "}
              before check-in — <span className="text-white/80">50%</span> of room charges
              are deducted.
            </>,
            <>
              <span className="text-red-400 font-semibold">Within 24 hours</span> of
              check-in (or no-show) — <span className="text-white/80">100%</span> of room
              charges are non-refundable.
            </>,
          ]}
        />
      </Section>

      <Section title="Refundable Security Deposit">
        <P>
          The ₹200 refundable security deposit is <span className="text-white/80">always
          returned</span> regardless of when you cancel — it is never part of the
          cancellation charge. At check-out it is refunded in full unless deducted for
          damage to property.
        </P>
      </Section>

      <Section title="Refund Timeline & Method">
        <Bullets
          items={[
            `Approved refunds are processed to your original payment method within ${BUSINESS.refundWindow}.`,
            "The exact credit date depends on your bank/card issuer or UPI provider.",
            "“Pay at Hotel” bookings collect no advance payment online, so no online refund is applicable for those cancellations.",
          ]}
        />
      </Section>

      <Section title="How to Cancel">
        <P>
          Log in and open your booking under <span className="text-white/80">My Bookings</span>,
          then choose <span className="text-white/80">Cancel</span>. You will see the
          applicable charge and refund amount before confirming. You can also contact us
          for assistance.
        </P>
      </Section>

      <Section title="Need Help?">
        <P>
          For any cancellation or refund query, contact us at{" "}
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
