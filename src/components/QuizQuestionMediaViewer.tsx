import type { QuizQuestionMedia } from "@/lib/quiz-question-media";

type Props = {
  media: QuizQuestionMedia | null;
  className?: string;
};

export function QuizQuestionMediaViewer({ media, className = "" }: Props) {
  if (!media) return null;

  const rootClassName = [
    "overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (media.kind === "image") {
    return (
      <figure className={rootClassName}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media.url}
          alt={media.fileName}
          className="max-h-[420px] w-full object-contain"
        />
      </figure>
    );
  }

  return (
    <figure className={rootClassName}>
      <video
        controls
        preload="metadata"
        className="max-h-[420px] w-full bg-black"
      >
        <source src={media.url} type={media.mimeType} />
      </video>
    </figure>
  );
}
