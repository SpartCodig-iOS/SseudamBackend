import React from 'react';
import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8 md:p-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">개인정보 처리방침</h1>
          <div className="w-24 h-1 bg-blue-500 mx-auto mb-6"></div>
          <p className="text-lg text-gray-600">쓰담(SseuDam) 서비스</p>
        </div>

        {/* 서문 */}
        <section className="mb-8">
          <div className="bg-blue-50 rounded-lg p-6 border-l-4 border-blue-500">
            <p className="text-gray-700 leading-relaxed">
              <strong>쓰담</strong>은 개인정보 보호법 제30조에 따라 정보주체의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 하기 위하여 다음과 같이 개인정보 처리지침을 수립·공개합니다.
            </p>
            <p className="mt-4 text-blue-800 font-semibold">
              • 이 개인정보처리방침은 <strong>2025년 11월 24일</strong>부터 적용됩니다.
            </p>
          </div>
        </section>

        {/* 제1조 */}
        <ArticleSection
          title="제1조(개인정보의 처리목적)"
          content={
            <div className="space-y-4">
              <p>
                <strong>쓰담</strong>은 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 개인정보 보호법 제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.
              </p>

              <div className="ml-4 space-y-3">
                <div>
                  <h4 className="font-semibold text-gray-900">1. 앱 회원가입 및 관리</h4>
                  <p className="text-gray-700 ml-4">
                    회원 가입의사 확인, 회원제 서비스 제공에 따른 본인 식별·인증, 회원자격 유지·관리, 서비스 부정이용 방지 목적으로 개인정보를 처리합니다.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900">2. 재화 또는 서비스 제공</h4>
                  <p className="text-gray-700 ml-4">
                    콘텐츠 제공, 맞춤서비스 제공, 본인인증을 목적으로 개인정보를 처리합니다.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900">3. 마케팅 및 광고에의 활용</h4>
                  <p className="text-gray-700 ml-4">
                    신규 서비스(제품) 개발 및 맞춤 서비스 제공, 이벤트 및 광고성 정보 제공 및 참여기회 제공, 인구통계학적 특성에 따른 서비스 제공 및 광고 게재, 서비스의 유효성 확인, 접속빈도 파악 또는 회원의 서비스 이용에 대한 통계 등을 목적으로 개인정보를 처리합니다.
                  </p>
                </div>
              </div>
            </div>
          }
        />

        {/* 제2조 */}
        <ArticleSection
          title="제2조(개인정보의 처리 및 보유기간)"
          content={
            <div className="space-y-4">
              <p>
                ① <strong>쓰담</strong>은 법령에 따른 개인정보 보유·이용기간 또는 정보주체로부터 개인정보를 수집시에 동의받은 개인정보 보유·이용기간 내에서 개인정보를 처리·보유합니다.
              </p>

              <p>② 각각의 개인정보 처리 및 보유 기간은 다음과 같습니다.</p>

              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>
                  <strong>회원 가입 및 관리</strong>: 서비스 이용계약 또는 회원 가입 해지시까지. 다만, 다음의 사유에 해당하는 경우에는 해당 사유 종료시까지
                  <ul className="list-decimal list-inside ml-6 mt-2 space-y-1">
                    <li>서비스 이용에 따른 채권·채무관계 잔존시에는 해당 채권·채무관계 정산시까지</li>
                    <li>전자상거래에서의 계약·청약철회, 대금결제, 재화 등 공급기록: 5년</li>
                  </ul>
                </li>
              </ul>
            </div>
          }
        />

        {/* 제5조 */}
        <ArticleSection
          title="제5조(정보주체와 법정대리인의 권리·의무 및 행사방법)"
          content={
            <p>
              사용자는 정보주체로서 <strong>쓰담</strong>에 대해 언제든지 개인정보 열람․정정․삭제․처리정지 요구 등의 권리를 행사할 수 있습니다.
            </p>
          }
        />

        {/* 제6조 */}
        <ArticleSection
          title="제6조(처리하는 개인정보 항목)"
          content={
            <div className="space-y-3">
              <p><strong>쓰담</strong>은 다음의 개인정보 항목을 처리하고 있습니다.</p>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">회원 가입</h4>
                <ul className="space-y-1">
                  <li><strong>필수항목</strong>: 이메일</li>
                  <li><strong>선택항목</strong>: 닉네임</li>
                </ul>
              </div>
            </div>
          }
        />

        {/* 제7조 */}
        <ArticleSection
          title="제7조(개인정보 파기)"
          content={
            <div className="space-y-4">
              <p>
                <strong>쓰담</strong>은 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체없이 해당 개인정보를 파기합니다. 개인정보 파기의 절차 및 방법은 다음과 같습니다.
              </p>

              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>
                  <strong>파기절차</strong>: <strong>쓰담</strong>은 파기 사유가 발생한 개인정보를 선정하고, <strong>쓰담</strong>의 개인정보 보호책임자의 승인을 받아 개인정보를 파기합니다.
                </li>
                <li>
                  <strong>파기방법</strong>: <strong>쓰담</strong>은 전자적 파일 형태로 기록․저장된 개인정보는 기록을 재생할 수 없도록 파기하며, 종이 문서에 기록․저장된 개인정보는 분쇄기로 분쇄하거나 소각하여 파기합니다.
                </li>
              </ul>
            </div>
          }
        />

        {/* 제8조 */}
        <ArticleSection
          title="제8조(개인정보의 안전성 확보조치)"
          content={
            <div className="space-y-4">
              <p><strong>쓰담</strong>은 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.</p>

              <ul className="list-disc list-inside ml-4 space-y-1">
                <li><strong>관리적 조치</strong>: 내부관리계획 수립․시행</li>
                <li><strong>기술적 조치</strong>: 데이터베이스 시스템의 접근권한 관리</li>
              </ul>
            </div>
          }
        />

        {/* 제9조 */}
        <ArticleSection
          title="제9조(개인정보 자동 수집 장치의 설치∙운영 및 거부에 관한 사항)"
          content={
            <p>
              <strong>쓰담</strong>은 정보주체의 이용정보를 저장하고 수시로 불러오는 '쿠키(cookie)'를 사용하지 않습니다.
            </p>
          }
        />

        {/* 제10조 */}
        <ArticleSection
          title="제10조(개인정보 보호책임자)"
          content={
            <div className="space-y-4">
              <p>
                ① <strong>쓰담</strong>은 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
              </p>

              <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
                <h4 className="font-semibold text-blue-900 mb-2">▶ 개인정보 보호책임자</h4>
                <div className="space-y-1">
                  <p><strong>성명</strong>: 쓰담</p>
                  <p><strong>연락처</strong>: <a href="mailto:suhwj81@gmail.com" className="text-blue-600 hover:underline">suhwj81@gmail.com</a></p>
                </div>
              </div>

              <p>
                ② 정보주체께서는 <strong>쓰담</strong> 서비스(또는 사업)을 이용하시면서 발생한 모든 개인정보 보호 관련 문의, 불만처리, 피해구제 등에 관한 사항을 개인정보 보호책임자로 문의하실 수 있습니다. <strong>쓰담</strong>은 정보주체의 문의에 대해 지체없이 답변 및 처리해드릴 것입니다.
              </p>
            </div>
          }
        />

        {/* 제11조 */}
        <ArticleSection
          title="제11조(정보주체의 권익침해에 대한 구제방법)"
          content={
            <div className="space-y-4">
              <p>
                정보주체는 개인정보침해로 인한 구제를 받기 위하여 개인정보분쟁조정위원회, 한국인터넷진흥원 개인정보침해신고센터 등에 분쟁해결이나 상담 등을 신청할 수 있습니다. 이 밖에 기타 개인정보침해의 신고, 상담에 대하여는 아래의 기관에 문의하시기 바랍니다.
              </p>

              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <ol className="list-decimal list-inside space-y-2">
                  <li>
                    <strong>개인정보분쟁조정위원회</strong>: (국번없이) 1833-6972
                    (<a href="https://www.kopico.go.kr" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">www.kopico.go.kr</a>)
                  </li>
                  <li>
                    <strong>개인정보침해신고센터</strong>: (국번없이) 118
                    (<a href="https://privacy.kisa.or.kr" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">privacy.kisa.or.kr</a>)
                  </li>
                  <li>
                    <strong>대검찰청</strong>: (국번없이) 1301
                    (<a href="https://www.spo.go.kr" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">www.spo.go.kr</a>)
                  </li>
                  <li>
                    <strong>경찰청</strong>: (국번없이) 182
                    (<a href="https://ecrm.cyber.go.kr" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">ecrm.cyber.go.kr</a>)
                  </li>
                </ol>
              </div>
            </div>
          }
        />

        {/* 제12조 */}
        <ArticleSection
          title="제12조(개인정보 처리방침 변경)"
          content={
            <p>이 개인정보처리방침은 <strong>2025년 11월 24일</strong>부터 적용됩니다.</p>
          }
        />

        {/* 네비게이션 링크 */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-center"
            >
              홈으로 돌아가기
            </Link>
            <Link
              href="/terms"
              className="border border-blue-600 text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors text-center"
            >
              이용약관 보기
            </Link>
          </div>
        </div>

        {/* 푸터 */}
        <footer className="bg-gray-800 text-white rounded-lg p-6 text-center mt-12">
          <h3 className="text-xl font-bold mb-2">쓰담</h3>
          <p className="text-gray-300 mb-2">여행 후 복잡한 정산 과정을 쉽고 투명하고 간편하게 해결하는 서비스</p>
          <p className="text-sm text-gray-400">개인정보 보호책임자: 쓰담 (suhwj81@gmail.com)</p>
        </footer>
      </div>
    </div>
  );
}

// 재사용 가능한 Article Section 컴포넌트
function ArticleSection({ title, content }: { title: string; content: React.ReactNode | string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-6 mb-6 border-l-4 border-blue-500">
      <h3 className="text-lg font-bold text-gray-900 mb-4">{title}</h3>
      <div className="text-gray-700 leading-relaxed">
        {typeof content === 'string' ? <p>{content}</p> : content}
      </div>
    </div>
  );
}