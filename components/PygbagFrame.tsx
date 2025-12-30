'use client';

type Props = { src: string };

export default function PygbagFrame({ src }: Props) {
  return (
    <iframe
      src={src}
      className="w-full h-96 mt-4 border"
      title="Pygame Game"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
