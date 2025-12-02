import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* 네비게이션 */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center space-x-2">
                <Image
                  src="/logo.svg"
                  alt="쓰담 로고"
                  width={40}
                  height={40}
                  className="w-8 h-8 sm:w-10 sm:h-10"
                />
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">쓰담</h1>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/terms" className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
                이용약관
              </Link>
              <Link href="/privacy" className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
                개인정보처리방침
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* 메인 콘텐츠 */}
      <main className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="text-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            {/* 로고/제목 */}
            <div className="flex flex-col items-center mb-6">
              <Image
                src="/logo.svg"
                alt="쓰담 로고"
                width={120}
                height={120}
                className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 mb-4"
              />
              <h1 className="text-4xl sm:text-6xl md:text-8xl font-bold text-gray-900">
                쓰담
                <span className="text-blue-600">.</span>
              </h1>
            </div>

            {/* 영문명 */}
            <p className="text-xl md:text-2xl text-gray-600 mb-8 font-light">
              SseuDam
            </p>

            {/* 서비스 설명 */}
            <p className="text-lg md:text-xl text-gray-700 mb-12 leading-relaxed max-w-3xl mx-auto">
              여행 후 복잡한 정산 과정을
              <span className="text-blue-600 font-semibold"> 쉽고 투명하고 간편하게 </span>
              해결하는 서비스
            </p>

            {/* CTA 버튼 */}
            <div className="flex justify-center items-center">
              <button className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors shadow-lg">
                서비스 시작하기
              </button>
            </div>

            {/* 특징 */}
            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="text-3xl mb-4">💸</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">쉬운 정산</h3>
                <p className="text-gray-600">복잡한 계산 없이 간단하게 여행 경비를 정산하세요</p>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="text-3xl mb-4">🔍</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">투명한 과정</h3>
                <p className="text-gray-600">모든 지출 내역을 투명하게 공유하고 확인하세요</p>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="text-3xl mb-4">⚡</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">빠른 처리</h3>
                <p className="text-gray-600">몇 번의 클릭만으로 정산을 완료하세요</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 푸터 */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex flex-col items-center mb-4">
              <Image
                src="/logo.svg"
                alt="쓰담 로고"
                width={40}
                height={40}
                className="w-8 h-8 mb-2 filter brightness-0 invert"
              />
              <h3 className="text-xl font-bold text-white">쓰담</h3>
            </div>
            <p className="text-gray-300 mb-3">여행 후 복잡한 정산 과정을 쉽고 투명하고 간편하게 해결하는 서비스</p>
            <p className="text-sm text-gray-400 mb-4">개인정보 보호책임자: 쓰담 (suhwj81@gmail.com)</p>
            <div className="mt-4 space-x-6">
              <Link href="/terms" className="text-gray-400 hover:text-white transition-colors">
                이용약관
              </Link>
              <Link href="/privacy" className="text-gray-400 hover:text-white transition-colors">
                개인정보처리방침
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
