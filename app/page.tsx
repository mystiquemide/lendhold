import { NavBar } from "@/components/ui/NavBar";

export default function Home() {
  return (
    <>
      <NavBar links={[]} />
      <main className="mx-auto w-full max-w-[1224px] px-6 pt-[120px] text-center md:pt-[160px]">
        <h1 className="text-[40px] leading-[44px] tracking-[-0.02em] text-ink md:text-[72px] md:leading-[76px]">
          Borrow against your stocks.
          <br />
          Keep them.
        </h1>
        <p className="mx-auto mt-6 max-w-[640px] text-xl leading-[30px] text-body">
          Get dollars on BNB Chain against the tokenized US stocks you hold. You keep the shares, and you see the price
          where risk starts before you sign anything.
        </p>
      </main>
    </>
  );
}
