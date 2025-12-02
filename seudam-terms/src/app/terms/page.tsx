import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function TermsOfService() {
  return (
    <div className="min-h-screen py-6 px-3 sm:py-12 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-4 sm:p-8 md:p-12">
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex flex-col items-center mb-4 sm:mb-6">
            <Link href="/" className="flex items-center space-x-2 mb-4">
              <Image
                src="/logo.svg"
                alt="쓰담 로고"
                width={48}
                height={48}
                className="w-10 h-10 sm:w-12 sm:h-12"
              />
              <span className="text-xl sm:text-2xl font-bold text-gray-900">쓰담</span>
            </Link>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">쓰담 서비스 이용약관</h1>
          </div>
          <div className="w-16 sm:w-24 h-1 bg-blue-500 mx-auto mb-4 sm:mb-6"></div>
          <p className="text-base sm:text-lg text-gray-600">쓰담(SseuDam) 서비스</p>
        </div>

        {/* 총칙 */}
        <section className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 border-l-4 border-blue-500 pl-3 sm:pl-4">
            총칙
          </h2>

          <ArticleSection
            title="제1조 [목적]"
            content="본 이용약관은 쓰담 (이하 '회사'라 합니다)이 운영하는 '쓰담' 서비스 (이하 '쓰담'이라 합니다)을 이용하는 자(이하 '이용자'라 합니다) 사이의 권리, 의무, 기타 필요한 사항을 정함으로써 상호 이익을 도모하는 것을 그 목적으로 합니다."
          />

          <ArticleSection
            title="제2조 [용어의 정의]"
            content={
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>본 약관에서 사용하는 용어의 정의는 다음과 같습니다.</li>
                <li>이용자: 쓰담 서비스를 이용하는 자</li>
                <li>이름(닉네임): 회원의 표시를 위하여 회원이 설정한 문자, 문자와 숫자의 조합, 문자, 숫자 및 기호의 조합을 말합니다.</li>
                <li>ID: 이용자 식별과 서비스 이용을 위하여 회사가 부여한 문자, 특수문자, 숫자 등의 조합</li>
                <li>게시물: 이용자가 &quot;쓰담&quot;이 제공하는 서비스에 게시한 문자, 문서, 그림, 링크, 파일 혹은 이들의 조합으로 이루어진 정보 등 모든 정보나 자료를 말합니다.</li>
              </ol>
            }
          />

          <ArticleSection
            title="제3조 [약관의 명시, 효력과 개정]"
            content={
              <ol className="list-decimal list-inside space-y-3 ml-4">
                <li>본 약관은 서비스를 이용하고자 하는 모든 이용자에 대하여 그 효력이 발생합니다.</li>
                <li>본 약관의 내용은 서비스 내에 게시하는 방법으로 이용자에게 공지하고, 이에 동의한 이용자가 회사가 제공하는 서비스를 이용함으로써 효력이 발생합니다.</li>
                <li>회사는 약관의 규제에 관한 법률, 전자문서 및 전자거래기본법, 전자금융거래법, 전자 서명법, 정보통신망 이용촉진 및 정보보호 등에 관한 법률, 전자상거래 등에서의 소비자보호에 관한 법률, 소비자기본법 등 관련법령을 위배하지 않는 범위에서 이 약관을 개정할 수 있습니다.</li>
                <li>회사가 약관을 변경할 경우에는 적용일자 및 변경 사유를 서비스 내의 배너 또는 공지사항 게시판 등을 통해 그 적용일자 7일 전부터 공지합니다. 다만, 이용자에게 불리한 약관의 변경인 경우에는 그 적용일자 30일 전부터 공지하며, 어플리케이션 알림(PNS)의 발송, 전자우편 등으로 이용자에게 개별 통지합니다.</li>
                <li>이용자는 회사가 전항에 따라 변경하는 약관에 동의하지 않을 권리가 있으며, 이 경우 회사에서 제공하는 서비스 이용 중단 및 탈퇴 의사를 표시하고 서비스 이용 종료를 요청할 수 있습니다.</li>
              </ol>
            }
          />

          <ArticleSection
            title="제4조 [이용계약의 체결]"
            content={
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>이용계약은 별도의 회원가입이 없이 이용자가 서비스에서 제공하는 이용 시작 페이지에서 서비스 이용약관에 동의한 후 이용신청을 함으로써 체결됩니다.</li>
                <li>회사는 서비스 관련 설비의 여유가 없거나, 기술상 또는 업무상 문제가 있는 경우에는 이용을 유보할 수 있습니다.</li>
                <li>제2항에 따라 이용 신청의 승낙을 하지 아니하거나 유보한 경우, 회사는 원칙적으로 이를 이용신청자에게 관련된 사항을 서비스 화면에 게시하여 알리도록 합니다.</li>
              </ol>
            }
          />

          <ArticleSection
            title="제5조 [이용자 정보변경]"
            content="이용자는 프로필 수정화면을 통하여 언제든지 본인의 닉네임을 변경할 수 있습니다."
          />

          <ArticleSection
            title="제6조 [회사의 의무]"
            content={
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>회사는 계속적이고 안정적인 서비스의 제공을 위하여 최선을 다하여 노력합니다.</li>
                <li>회사는 이용자가 안전하게 서비스를 이용할 수 있도록 현재 인터넷 보안기술의 발전 수준과 회사가 제공하는 서비스의 성격에 적합한 보안시스템을 갖추고 운영해야 합니다.</li>
                <li>회사는 이용자로부터 제기되는 의견이나 불만이 정당하다고 인정할 경우를 이를 처리하여야 합니다. 이때 처리과정에 대해서 고객에게 메일 및 게시판 등의 방법으로 전달합니다.</li>
                <li>회사는 정보통신망 이용촉진 및 정보보호에 관한 법률, 통신비밀보호법, 전기통신사업법 등 서비스의 운영, 유지와 관련 있는 법규를 준수합니다.</li>
              </ol>
            }
          />

          <ArticleSection
            title="제7조 [이용자의 의무]"
            content={
              <>
                <p className="mb-4">이용자는 본인의 책임 하에 본 서비스 및 본 서비스에서 제공되는 각종 아이템을 이용하며, 이용자는 본 서비스를 통해 이루어진 일체의 행위 및 그 결과에 대하여 책임을 지며, 다음 각 호의 행위를 하여서는 안 됩니다.</p>
                <ol className="list-decimal list-inside space-y-1 ml-4">
                  <li>타인의 정보 도용</li>
                  <li>회사의 운영자, 임직원, 회사를 사칭하거나 관련 정보를 도용</li>
                  <li>회사가 게시한 정보의 변경</li>
                  <li>회사와 기타 제3자의 저작권, 영업비밀, 특허권 등 지적재산권에 대한 침해</li>
                  <li>회사와 다른 이용자 및 기타 제3자를 희롱하거나, 위협하거나 명예를 손상시키는 행위</li>
                  <li>외설, 폭력적인 메시지, 기타 공서양속에 반하는 정보를 공개 또는 게시하는 행위</li>
                  <li>회사와 사전 협의되지 않은 광고 및 홍보물을 게시하는 행위</li>
                  <li>해킹을 통해서 이용자의 정보를 취득하는 행위</li>
                  <li>기타 현행 법령에 위반되는 불법적인 행위</li>
                </ol>
              </>
            }
          />

          <ArticleSection
            title="제8조 [이용자의 대한 통지]"
            content={
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>회사는 이용자의 서비스 이용에 필요한 권리 및 의무 등의 관한 사항을 어플리케이션에서 알림(PNS)를 하는 방법으로 통지를 할 수 있습니다.</li>
                <li>회사는 불특정다수 회원에 대한 통지의 경우 1주일 이상 서비스에 게시함으로써 개별 통지에 갈음할 수 있습니다.</li>
              </ol>
            }
          />

          <ArticleSection
            title="제9조 [쓰담의 서비스 제공 범위 및 한계]"
            content={
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>회사는 이용자에게 다음과 같은 서비스를 제공합니다.</li>
                <li>여행 후 복잡한 정산 과정을 쉽고 투명하고 간편하게 해결하는 서비스</li>
                <li>회사가 제공하는 서비스의 형태와 기능, 디자인 등 필요한 경우 수시로 변경되거나, 중단될 수 있습니다. 회사는 이 경우 개별적인 변경에 대해서 이용자에게 사전 통지하지 않습니다. 다만, 이용자에게 불리한 것으로 판단되는 경우 전자게시판에 공지하는 방법으로 이를 공지합니다.</li>
                <li>회사가 제공하는 전항의 서비스는 회원이 재화 등을 거래할 수 있도록 사이버몰의 이용을 허락하거나, 통신판매를 알선하는 것을 목적으로 하며, 개별 이용자가 &quot;쓰담&quot;에 등록한 상품과 관련해서는 일체의 책임을 지지 않습니다.</li>
              </ol>
            }
          />
        </section>

        {/* 이용자 관리 및 보호 */}
        <section className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 border-l-4 border-blue-500 pl-3 sm:pl-4">
            이용자 관리 및 보호
          </h2>

          <ArticleSection
            title="제13조 [이용자관리]"
            content={
              <div className="space-y-4">
                <p>회사는 본 약관의 본지와 관련 법령 및 상거래의 일반원칙을 위반한 이용자에 대하여 다음과 같은 조치를 할 수 있습니다.</p>
                <ol className="list-decimal list-inside space-y-1 ml-4">
                  <li>회사가 부가적으로 제공한 혜택의 일부 또는 전부의 회수</li>
                  <li>특정 서비스 이용제한</li>
                  <li>적법하지 않은 게시물의 삭제</li>
                  <li>이용계약의 해지</li>
                  <li>손해배상의 청구</li>
                </ol>
              </div>
            }
          />

          <ArticleSection
            title="제14조 [저작권의 귀속 및 이용제한]"
            content={
              <div className="space-y-4">
                <ol className="list-decimal list-inside space-y-3 ml-4">
                  <li>서비스 이용자가 서비스 내에 게시한 아이템의 저작권은 해당 게시물의 게시자가 아닌 게시물의 원저작자에게 귀속됩니다.</li>
                  <li>서비스 이용자가 서비스 내에 작성한 게시물에 대한 책임 및 권리는 게시물을 등록한 이용자에게 있으며, 해당 게시물이 타인의 지적 재산권을 침해하여 발생되는 모든 책임은 이용자 본인에게 있습니다.</li>
                  <li>서비스에 대한 저작권 및 지적재산권, 회사가 작성한 게시물의 저작권은 회사에 귀속됩니다.</li>
                  <li>이용자는 &quot;쓰담&quot;을 이용함으로써 얻은 정보를 회사의 사전 승낙 없이 복제, 송신, 출판, 배포, 방송 기타 방법에 의하여 영리 목적으로 이용하거나 제3자에게 이용하게 하여서는 안 됩니다.</li>
                </ol>

                <div className="bg-red-50 border-l-4 border-red-400 p-4 my-6">
                  <p className="font-semibold text-red-800 mb-2">회사는 게시물이 다음 각 호에 해당하는 경우 사전 통보 없이 해당 게시물을 삭제하거나 게시자에 대하여 특정 서비스의 이용제한, 이용계약의 해지 등의 조치를 할 수 있습니다.</p>
                  <ol className="list-decimal list-inside space-y-1 text-red-700 ml-4">
                    <li>대한민국의 법령을 위반하는 내용을 포함하는 경우</li>
                    <li>관계법령에 의거 판매가 금지된 불법 제품 또는 음란물을 게시, 광고하는 경우</li>
                    <li>허위 또는 과대 광고의 내용을 포함하는 경우</li>
                    <li>타인의 권리나 명예, 신용 기타 정당한 이익을 침해하는 경우</li>
                    <li>직거래 유도 또는 타사이트의 링크를 게시하는 경우</li>
                    <li>정보통신기기의 오작동을 일으킬 수 있는 악성코드나 데이터를 포함하는 경우</li>
                    <li>사회 공공질서나 미풍양속에 위배되는 경우</li>
                    <li>회사가 제공하는 서비스의 원활한 진행을 방해하는 것으로 판단되는 경우</li>
                  </ol>
                </div>
              </div>
            }
          />
        </section>

        {/* 기타 */}
        <section className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 border-l-4 border-blue-500 pl-3 sm:pl-4">
            기타
          </h2>

          <ArticleSection
            title="제15조 [약관 외 준칙 및 관련 법령과의 관계]"
            content={
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>회사는 제공하는 개별 서비스에 대해서 별도의 이용약관 및 정책을 둘 수 있으며, 해당 내용이 이 약관과 상충할 경우 개별 서비스의 이용약관을 우선하여 적용합니다.</li>
                <li>본 약관에 명시되지 않은 사항이 관계법령에 규정되어 있을 경우에는 그 규정에 따릅니다.</li>
              </ol>
            }
          />

          <ArticleSection
            title="제16조 [타사 링크, 사이트, 서비스]"
            content={
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>회사는 타사 웹사이트, 광고주, 서비스, 특별혜택 또는 회사가 소유하거나 관리하지 않는 기타 이벤트나 활동으로 연결되는 링크를 제공할 수 있습니다.</li>
                <li>회사는 이러한 타사 사이트, 정보, 자료, 제품, 서비스에 대해 어떠한 보증을 하거나 책임을 지지 않습니다.</li>
                <li>&apos;쓰담&apos;에서 타사 웹사이트, 서비스, 콘텐츠에 접근할 때 이로부터 발생할 수 있는 모든 위험은 이용자가 감수해야 하며, 이용자는 타사 웹사이트, 서비스, 콘텐츠에 접근하거나 사용함으로써 발생하는 손실에 대해서 회사가 어떠한 책임도 지지 않는 다는 것에 동의합니다.</li>
              </ol>
            }
          />

          <ArticleSection
            title="제17조 [회사의 면책]"
            content={
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>제10조 제3항, 제4항의 사유로 인하여 서비스를 일시적으로 중단하는 경우 회사는 이로 인하여 회원 또는 제3자가 입은 손해에 대하여 책임지지 않습니다. 단, 회사의 고의 또는 중과실로 인한 경우에는 그러하지 아니합니다.</li>
                <li>제10조 5항의 사유로 인하여 서비스를 제한하거나 중단하는 경우 회사는 불가항력을 이유로 그 책임을 면합니다.</li>
                <li>회사는 이용자 또는 제휴사의 귀책사유로 인한 서비스 이용의 장애에 대하여 책임을 지지 않습니다.</li>
                <li>회사는 신상정보 및 전자우편 주소의 부정확한 기재, 비밀번호 관리의 소홀 등 이용자의 귀책사유로 인해 손해가 발생한 경우, 회사는 책임을 지지 않습니다.</li>
                <li>회사는 무료로 제공하는 서비스 이용과 관련하여 관련 법령에 특별한 규정이 없는 한, 이용자에게 손해가 생기더라도 책임지지 않습니다.</li>
              </ol>
            }
          />

          <ArticleSection
            title="제18조 [관할법원]"
            content="이 약관에 따른 회사와 회원 간의 서비스 이용계약 및 회원 상호간의 분쟁에 대하여 회사를 당사자로 하는 소송이 제기될 경우에는 대한민국 법을 준거법으로 하며, 회사의 본사 소재지를 관할하는 법원을 전속적 합의 관할법원으로 정합니다."
          />
        </section>

        {/* 부칙 */}
        <section className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 border-l-4 border-blue-500 pl-3 sm:pl-4">
            부칙
          </h2>

          <div className="bg-blue-50 rounded-lg p-4 sm:p-6 text-center">
            <p className="text-base sm:text-lg font-semibold text-blue-900 mb-2">이용약관 버전 1.1</p>
            <p className="text-sm sm:text-base text-blue-800">본 이용약관 시행일자: 2025년 11월 24일</p>
          </div>
        </section>

        {/* 네비게이션 링크 */}
        <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link
              href="/"
              className="bg-blue-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-center text-sm sm:text-base"
            >
              홈으로 돌아가기
            </Link>
            <Link
              href="/privacy"
              className="border border-blue-600 text-blue-600 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors text-center text-sm sm:text-base"
            >
              개인정보처리방침 보기
            </Link>
          </div>
        </div>

        {/* 푸터 - 쓰담 텍스트 가시성 개선 */}
        <footer className="bg-gray-900 text-white rounded-lg p-4 sm:p-6 text-center mt-8 sm:mt-12 border border-gray-700">
          <div className="flex flex-col items-center mb-4">
            <Image
              src="/logo.svg"
              alt="쓰담 로고"
              width={32}
              height={32}
              className="w-6 h-6 sm:w-8 sm:h-8 mb-2 filter brightness-0 invert"
            />
            <h3 className="text-2xl sm:text-3xl font-bold text-white">쓰담</h3>
          </div>
          <p className="text-gray-200 mb-3 text-sm sm:text-base leading-relaxed">여행 후 복잡한 정산 과정을 쉽고 투명하고 간편하게 해결하는 서비스</p>
          <p className="text-xs sm:text-sm text-gray-300">개인정보 보호책임자: 쓰담 (suhwj81@gmail.com)</p>
        </footer>
      </div>
    </div>
  );
}

// 재사용 가능한 Article Section 컴포넌트
function ArticleSection({ title, content }: { title: string; content: React.ReactNode | string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6 border-l-4 border-blue-500">
      <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4">{title}</h3>
      <div className="text-sm sm:text-base text-gray-700 leading-relaxed">
        {typeof content === 'string' ? <p>{content}</p> : content}
      </div>
    </div>
  );
}