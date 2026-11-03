import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-3xl pt-8 sm:pt-16">
      <h1 className="font-serif text-5xl leading-[1.1] sm:text-6xl">Evidence Vault</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
        Store your awards and activities once, then export evidence packets for
        any application.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/login" className="btn btn-primary">
          Log in
        </Link>
        <Link href="/signup" className="btn btn-secondary">
          Sign up
        </Link>
      </div>
    </div>
  );
}
