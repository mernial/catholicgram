import Link from 'next/link';

// 개인정보처리방침 / 이용약관 / 계정 삭제 안내 페이지 공통 틀
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="max-w-xl mx-auto min-h-screen bg-white border-x border-stone-200 px-5 py-8 text-stone-800">
      <Link href="/" className="text-xs text-stone-500 hover:text-stone-800">← 가톨릭그램으로 돌아가기</Link>
      <h1 className="font-serif font-bold text-2xl text-stone-900 mt-4">{title}</h1>
      <p className="text-xs text-stone-400 mt-1">시행일: {updated}</p>
      <div className="mt-6 flex flex-col gap-6 text-sm leading-relaxed [&_h2]:font-bold [&_h2]:text-stone-900 [&_h2]:text-base [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1 [&_table]:w-full [&_table]:text-xs [&_th]:bg-stone-50 [&_th]:text-left [&_th]:p-2 [&_th]:border [&_th]:border-stone-200 [&_td]:p-2 [&_td]:border [&_td]:border-stone-200 [&_td]:align-top">
        {children}
      </div>
    </main>
  );
}
