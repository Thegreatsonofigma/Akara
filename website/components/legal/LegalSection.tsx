import type { LegalSectionData } from "@/lib/legal-content";

export function slugifyHeading(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function LegalSection({
  section,
  index,
}: {
  section: LegalSectionData;
  index: number;
}) {
  const id = slugifyHeading(section.heading);

  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-28 border-t border-hairline pt-8"
    >
      <h2
        id={`${id}-heading`}
        className="mb-4 flex items-baseline gap-3 text-xl font-bold text-white sm:text-2xl"
      >
        <span
          aria-hidden="true"
          className="font-numbers text-base tracking-wider text-brand/80"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        {section.heading}
      </h2>

      <div className="legal-prose flex flex-col gap-4">
        {section.paragraphs?.map((paragraph) => (
          <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        ))}

        {section.items && (
          <ul className="flex flex-col gap-2.5">
            {section.items.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-brand/70"
                />
                <span className="leading-relaxed text-white/72">{item}</span>
              </li>
            ))}
          </ul>
        )}

        {section.note && (
          <p className="rounded-xl border border-acid/25 bg-acid/[0.05] px-4 py-3 text-sm leading-relaxed text-acid">
            {section.note}
          </p>
        )}
      </div>
    </section>
  );
}
