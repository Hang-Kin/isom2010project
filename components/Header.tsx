import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-line bg-card/80">
      <div className="mx-auto flex w-full max-w-6xl items-center px-5 py-4 sm:px-8">
        <Link href="/" className="font-serif text-xl text-foreground no-underline">
          Evidence Vault
        </Link>
      </div>
    </header>
  );
}
