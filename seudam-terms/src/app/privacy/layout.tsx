import Link from 'next/link';

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 네비게이션 */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
                쓰담
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
                홈
              </Link>
              <Link href="/terms" className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
                이용약관
              </Link>
              <Link href="/privacy" className="text-blue-600 hover:text-blue-800 px-3 py-2 rounded-md text-sm font-medium font-semibold">
                개인정보처리방침
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {children}
    </div>
  );
}