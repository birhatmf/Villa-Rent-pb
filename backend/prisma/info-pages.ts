import type { Prisma } from "@prisma/client";

// Ana sayfa dışındaki kurumsal/yasal CMS sayfaları (Hakkımızda, İletişim, KVKK vb.).
// UYARI: 20260908_info_pages.sql bu sabitlerden ÜRETİLMİŞTİR; içerik değişirse SQL de yeniden üretilmelidir.
// Yönetim: canlı içerik /admin/pages üzerinden düzenlenir; bu sabitler yalnızca ilk yükleme içindir.

const img = (id: string, w = 1600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export const INFO_PAGES: {
  slug: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  sections: { type: string; content: Prisma.InputJsonValue }[];
}[] = [
  {
    slug: 'hakkimizda',
    title: 'Hakkımızda',
    seoTitle: 'Hakkımızda · Villa Sepeti',
    seoDescription:
      'Villa Sepeti hikâyesi: bizzat gezilen, kürasyonla seçilen kiralık villaların ardındaki ekip ve çalışma anlayışı.',
    sections: [
      {
        type: 'editorialSplit',
        content: {
          eyebrow: 'Hakkımızda',
          title: 'Katalog değil, kürasyon',
          body:
            'Portföyümüze giren her ev için en az bir gece kalıyoruz. Suyun basıncını, akşam ışığının nereye düştüğünü, komşunun ne kadar yakın olduğunu biliyoruz. Beğenmediğimiz evi listeye almıyoruz — bu yüzden listemiz kısa.\n\nHer rezervasyonu aynı özenle takip ediyoruz: girişte karşılama, konaklama boyunca tek numaradan destek, çıkışta dürüst bir kontrol. Tatil bittiğinde geriye yalnızca iyi bir hafta kalmasını önemsiyoruz.',
          image: img('photo-1600607687939-ce8a6c25118c', 1400),
          ctaLabel: 'Bize ulaşın',
          ctaHref: '/iletisim',
        },
      },
      {
        type: 'statBar',
        content: {
          stats: [
            { value: '480+', label: 'Bizzat gezilmiş villa' },
            { value: '32', label: 'Bölge' },
            { value: '4.9', label: 'Ortalama misafir puanı' },
            { value: '%98', label: 'Tekrar konaklama' },
          ],
        },
      },
      {
        type: 'textContent',
        content: {
          intro:
            'Kısa bir liste, uzun bir tatil. Sitede yazan her evi kendi standardımızla deneyimliyor, misafirlerimizin geri bildirimini aynı ciddiyetle yönetiyoruz.',
          items: [
            {
              title: 'Neden kurulduk',
              body:
                'Tatil kiralamada en büyük sorun, fotoğraflarla gerçek arasındaki farktır. Rezervasyon anındaki heyecanın yerini hayal kırıklığına bırakmaması için her evi bir misafir gözüyle deneyimleyip yalnızca içimize sinenleri listeye aldık.\n\nAmacımız en büyük katalog olmak değil; güvenle seçebileceğiniz, iyi yönetilen bir liste sunmak.',
            },
            {
              title: 'Nasıl çalışıyoruz',
              body:
                'Portföye giren her evi yerinde ziyaret ediyor; havuzu, su basıncını, yatak konforunu ve mahremiyeti birlikte değerlendiriyoruz. Anlaştığımız ev sahipleriyle yıl boyunca iletişimde kalıyor, fiyatları sezona ve talebe göre birlikte güncelliyoruz.\n\nRezervasyon tarafında kapora ve ödeme akışını şeffaf tutuyor, misafirin girişinden çıkışına kadar süreci tek bir ev sorumlusu ve destek hattıyla yönetiyoruz. Bir sorun olduğunda sizi aracı kurumlara yönlendirmiyoruz; sorun bizim sorunumuz.',
            },
            {
              title: 'Bölgelerimiz',
              body:
                'Kaş’tan Sapanca’ya kadar çalıştığımız her bölgeyi kendi ekibimizle düzenli geziyoruz. Bölgedeki evler, restoranlar ve ulaşım hakkındaki sorularınızı konaklama boyunca yanıtlıyoruz.',
            },
          ],
        },
      },
      {
        type: 'ctaBanner',
        content: {
          eyebrow: 'Ev sahipleri için',
          title: 'Villanızı doğru misafirle buluşturalım',
          text:
            'Portföyümüz seçkin olduğu için talep yüksek. Evinizi değerlendirelim; birlikte doluluk ve fiyat öngörüsü çıkaralım.',
          image: img('photo-1502005229762-cf1b2da7c5d6', 1600),
          primary: { label: 'Villanızı listeleyin', href: '/ev-sahibi' },
          secondary: { label: 'Bize ulaşın', href: '/iletisim' },
        },
      },
    ],
  },
  {
    slug: 'iletisim',
    title: 'İletişim',
    seoTitle: 'İletişim · Villa Sepeti',
    seoDescription:
      'Villa Sepeti iletişim bilgileri: telefon, e-posta ve adres. Sorularınız ve rezervasyon talepleriniz için buradayız.',
    sections: [
      {
        type: 'textContent',
        content: {
          intro:
            'Sorularınız, rezervasyon talepleriniz veya villanızla ilgili bir konu — fark etmez. Konaklama boyunca da aynı hat bizde.',
          items: [
            {
              title: 'Bizi arayın',
              body:
                '0212 000 00 00\n\nHafta içi 09.00 – 19.00, hafta sonu 10.00 – 18.00 arasında ulaşabilirsiniz. Konaklama sırasındaki acil durumlar için rezervasyon onayınızda yer alan 7/24 destek numarasını kullanın.',
            },
            {
              title: 'E-posta ile',
              body:
                'Sorularınız için merhaba@villasepeti.com adresine yazabilirsiniz. En geç bir iş günü içinde dönüş yapıyoruz.\n\nRezervasyon ve kapora belgelerini yalnızca bu adres üzerinden gönderiyoruz; şüpheli bir ileti alırsanız bize iletin.',
            },
            {
              title: 'Adresimiz',
              body:
                'Kalamış Cad. No: 12/4\nKadıköy, İstanbul\n\nRandevusuz ziyaretlere açık değiliz; görüşme için önceden e-posta ile randevu alabilirsiniz.',
            },
          ],
        },
      },
      {
        type: 'ctaBanner',
        content: {
          eyebrow: 'Hızlı kanallar',
          title: 'Size en uygun kanaldan yazın',
          text:
            'Rezervasyon öncesi sorularınız için WhatsApp en hızlı yol. Konaklamanızla ilgili detayları birlikte netleştirelim.',
          image: img('photo-1520250497591-112f2f40a3f4', 1600),
          primary: {
            label: 'WhatsApp’tan yazın',
            href: 'https://wa.me/905000000000?text=Merhaba%2C%20villa%20kiralama%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum.',
          },
          secondary: { label: 'Sıkça sorulanlar', href: '/sss' },
        },
      },
    ],
  },
  {
    slug: 'sss',
    title: 'Sıkça Sorulan Sorular',
    seoTitle: 'Sıkça Sorulan Sorular · Villa Sepeti',
    seoDescription:
      'Rezervasyon, ödeme, iptal ve konaklamayla ilgili en çok merak edilen soruların yanıtları.',
    sections: [
      {
        type: 'textContent',
        content: {
          intro:
            'Rezervasyondan önce en çok merak edilenleri derledik. Aradığınız yanıtı bulamazsanız İletişim sayfasından bize yazın.',
          items: [
            {
              title: 'Rezervasyon nasıl yapılıyor?',
              body:
                'Sitede tarihlerinizi ve misafir sayınızı seçerek rezervasyon oluşturursunuz. Rezervasyonu bağlamak için küçük bir kapora ödenir; kalan tutar giriş tarihine yakın net bir ödeme planıyla tahsil edilir. Tüm adımlar e-posta ile size iletilir.',
            },
            {
              title: 'Kapora ne kadar, iade ediliyor mu?',
              body:
                'Kapora, rezervasyon toplamının bir parçasıdır ve iptal koşullarına göre değerlendirilir. Ücretsiz iptal penceresi içinde yapılan iptallerde ödediğiniz kapora eksiksiz iade edilir. Detaylar için İptal Koşulları sayfasına bakabilirsiniz.',
            },
            {
              title: 'Ödemeyi nasıl yapabilirim?',
              body:
                'Ödemeler banka havalesi veya EFT ile yapılır. Rezervasyonunuz onaylandığında hesap bilgileri ve referans kodunuz e-postanıza gelir; ödemenizi ilettiğinizde ekip arkadaşımız sizi arayarak doğrular.',
            },
            {
              title: 'İptal etmek istersem ne olur?',
              body:
                'İptal koşullarını rezervasyon onayınızda ve İptal Koşulları sayfasında bulabilirsiniz. Değişiklik ve iptal taleplerinizi hesabınızdaki “Seyahatlerim” bölümünden veya bize yazarak iletebilirsiniz.',
            },
            {
              title: 'Konaklama sırasında sorun çıkarsa?',
              body:
                'Girişte sizi karşılayan ev sorumlusu ve konaklama boyunca ulaşabileceğiniz 7/24 destek hattımız var. Klimadan tekne turuna kadar her konuda size yön gösteririz; çözülemeyen bir sorun bırakmayız.',
            },
            {
              title: 'Temizlik ve çarşaf değişimi nasıl yapılıyor?',
              body:
                'Her konaklama öncesinde villa profesyonel olarak temizlenir ve çarşaf/havlu takımları yenilenir. Uzun konaklamalarda ara temizlik, villa sayfasında belirtilen koşullara göre ek ücretle planlanabilir.',
            },
            {
              title: 'Evcil hayvan kabul ediyor musunuz?',
              body:
                'Evcil hayvan politikası villa bazında değişir. Bir villayı beğendiğinizde rezervasyon öncesi bize yazmanız yeterli; size uygun seçenekleri birlikte belirleyelim.',
            },
            {
              title: 'Hangi bölgeyi önerirsiniz?',
              body:
                'Mayıs – Ekim arası için Kaş ve Kalkan sakin koylarıyla, Bodrum gece hayatı ve restoran çeşitliliğiyle öne çıkar. Kış konaklaması için Sapanca’da şömineli ve kapalı havuzlu evlerimiz var. Bütçe ve kalabalığa göre en iyi eşleşmeyi birlikte bulalım.',
            },
          ],
        },
      },
    ],
  },
  {
    slug: 'iptal-kosullari',
    title: 'İptal Koşulları',
    seoTitle: 'İptal Koşulları · Villa Sepeti',
    seoDescription:
      'Villa Sepeti rezervasyonları için geçerli iptal, iade ve değişiklik koşulları.',
    sections: [
      {
        type: 'textContent',
        content: {
          intro:
            'Tatil planları değişebilir. Aşağıdaki koşullar tüm rezervasyonlar için geçerlidir; iptal taleplerinizi hesabınızdan veya e-posta ile iletebilirsiniz.',
          items: [
            {
              title: 'Ücretsiz iptal penceresi',
              body:
                'Giriş tarihinden en az 30 gün önce yapılan iptallerde ödenen tüm tutar eksiksiz iade edilir. İade, ödemenin yapıldığı hesaba 10 iş günü içinde aktarılır.',
            },
            {
              title: 'Girişe 15 – 29 gün kala',
              body:
                'Bu dönemde yapılan iptallerde ödenen tutarın %50’si iade edilir, kalan kısım iptal bedeli olarak alıkonur.',
            },
            {
              title: 'Girişe 15 günden az kala',
              body:
                'Girişe 15 günden az kala yapılan iptallerde ödenen tutar iade edilmez. Bu dönemde rezervasyonunuzu, uygun olması hâlinde bir başka tarihe taşımayı önerebiliriz.',
            },
            {
              title: 'Villa kaynaklı iptaller',
              body:
                'Nadir durumlarda villa tarafında satışa kapanma veya bakım gibi bir gerekçeyle rezervasyonunuz iptal edilirse, ödediğiniz tüm tutar iade edilir; isterseniz aynı tarihler için size eşdeğer veya daha iyi bir alternatif sunarız.',
            },
            {
              title: 'Değişiklik talepleri',
              body:
                'Tarih veya villa değişikliği talepleri, villanın müsaitliğine bağlı olarak değerlendirilir. Rezervasyon sözleşmesi fiyatları değişiklik tarihindeki güncel fiyatlardan etkilenebilir; değişiklik onayı size yazılı olarak bildirilir.',
            },
            {
              title: 'Mücbir sebep',
              body:
                'Deprem, salgın, resmî seyahat yasağı gibi mücbir sebeplerde güncel koşullara göre tam iade veya tarih değişikliği seçenekleri sunarız. Her talebi bireysel olarak değerlendiririz.',
            },
            {
              title: 'Erken çıkış',
              body:
                'Konaklama başladıktan sonra yapılan erken çıkışlarda kullanılmayan geceler için iade yapılmaz.',
            },
          ],
        },
      },
    ],
  },
  {
    slug: 'kvkk',
    title: 'KVKK Aydınlatma Metni',
    seoTitle: 'KVKK Aydınlatma Metni · Villa Sepeti',
    seoDescription:
      'Villa Sepeti’nin 6698 sayılı KVKK kapsamında kişisel verilerin işlenmesine ilişkin aydınlatma metni.',
    sections: [
      {
        type: 'textContent',
        content: {
          intro:
            '6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca, kişisel verilerinizin hangi kapsamda işlendiğini aşağıda şeffaf biçimde açıklıyoruz.',
          items: [
            {
              title: 'Veri sorumlusu',
              body:
                'Villa Sepeti markası altında hizmet veren şirketimiz, KVKK kapsamında “veri sorumlusu” sıfatına sahiptir.\n\nAdres: Kalamış Cad. No: 12/4, Kadıköy, İstanbul\nE-posta: merhaba@villasepeti.com',
            },
            {
              title: 'İşlenen kişisel veriler',
              body:
                'Hizmetlerimizle sınırlı olmak üzere şu veriler işlenir:\n· Kimlik bilgileri: ad, soyad\n· İletişim bilgileri: e-posta adresi, telefon numarası, adres\n· Rezervasyon bilgileri: giriş/çıkış tarihleri, misafir sayısı, özel istekler\n· Hesap bilgileri: üyelik ve talep kayıtları\n· Ödeme bilgileri: yalnızca ödemenin doğrulanmasına yetecek kayıtlar',
            },
            {
              title: 'İşleme amaçları',
              body:
                'Kişisel verileriniz; rezervasyonların kurulması ve yönetilmesi, ödeme ve iade süreçlerinin yürütülmesi, talep ve şikâyetlerinizin yanıtlanması, yasal yükümlülüklerin yerine getirilmesi ve hizmet kalitesinin artırılması amaçlarıyla işlenir.',
            },
            {
              title: 'Hukuki sebepler',
              body:
                'Verileriniz, KVKK’nın 5. maddesinde sayılan; sözleşmenin kurulması ve ifası, hukuki yükümlülüğün yerine getirilmesi, meşru menfaat ve açık rızanızın bulunduğu durumlarda işlenir.',
            },
            {
              title: 'Kişisel verilerin aktarımı',
              body:
                'Verileriniz; rezervasyonun ifası için villa sahipleri ve ev sorumlularıyla, ödeme sürecinin yürütülmesi için ilgili banka ve ödeme kuruluşlarıyla, yasal zorunluluk hâlinde yetkili kamu kurumlarıyla paylaşılır. Verileriniz yurt dışına aktarılmaz.',
            },
            {
              title: 'Saklama süreleri',
              body:
                'Kişisel verileriniz, ilgili mevzuatta öngörülen veya işleme amacının gerektirdiği süre boyunca saklanır. Süre sonunda verileriniz silinir, yok edilir veya anonim hâle getirilir.',
            },
            {
              title: 'KVKK kapsamındaki haklarınız',
              body:
                'KVKK’nın 11. maddesi uyarınca; verilerinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini isteme, silinmesini veya yok edilmesini talep etme ve bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme haklarına sahipsiniz.',
            },
            {
              title: 'Başvuru yöntemi',
              body:
                'Yukarıdaki haklarınıza ilişkin taleplerinizi, kimliğinizi doğrulayıcı bilgilerle birlikte merhaba@villasepeti.com adresine iletebilirsiniz. Başvurularınız en geç 30 gün içinde ücretsiz olarak yanıtlanır.',
            },
          ],
        },
      },
    ],
  },
  {
    slug: 'gizlilik',
    title: 'Gizlilik Politikası',
    seoTitle: 'Gizlilik Politikası · Villa Sepeti',
    seoDescription:
      'Villa Sepeti’nin kişisel verilerin korunması ve gizlilik ilkelerine ilişkin politikası.',
    sections: [
      {
        type: 'textContent',
        content: {
          intro:
            'Gizliliğinize saygı duyuyoruz. Bu politika, sitemizi kullanırken hangi bilgilerin toplandığını, nasıl kullanıldığını ve hangi haklara sahip olduğunuzu açıklar.',
          items: [
            {
              title: 'Topladığımız bilgiler',
              body:
                'Rezervasyon ve üyelik süreçlerinde bize sağladığınız ad, iletişim ve ödeme bilgilerini; sitemizi kullanımınıza dair anonim kullanım verilerini toplarız. Ödeme kartı bilgileriniz tarafımızca saklanmaz.',
            },
            {
              title: 'Bilgilerinizi nasıl kullanıyoruz',
              body:
                'Toplanan bilgiler; rezervasyonunuzun kurulması ve yönetilmesi, size bilgilendirme yapılması, taleplerinizin yanıtlanması ve hizmetimizin geliştirilmesi için kullanılır. Açık onayınız olmadan pazarlama iletişimi göndermeyiz.',
            },
            {
              title: 'Bilgilerin paylaşımı',
              body:
                'Bilgileriniz, rezervasyonun ifası için gerekli taraflar (villa sahipleri, ev sorumluları, ödeme kuruluşları) ve yasal zorunluluk hâlinde yetkili makamlar dışında hiçbir üçüncü kişiyle paylaşılmaz.',
            },
            {
              title: 'Güvenlik',
              body:
                'Kişisel verilerinizin korunması için şifreleme, erişim kontrolü ve düzenli güvenlik denetimleri gibi teknik ve idari tedbirleri uygularız.',
            },
            {
              title: 'Çerezler',
              body:
                'Sitemiz, çalışması için zorunlu ve deneyimi geliştiren çerezler kullanır. Hangi çerezlerin ne amaçla kullanıldığını Çerez Politikası sayfamızda bulabilirsiniz.',
            },
            {
              title: 'Haklarınız ve iletişim',
              body:
                'Verilerinize erişme, düzeltilmesini veya silinmesini isteme hakkına sahipsiniz. Talepleriniz için merhaba@villasepeti.com adresine yazabilirsiniz; en geç 30 gün içinde yanıt veririz.',
            },
          ],
        },
      },
    ],
  },
  {
    slug: 'cerez-politikasi',
    title: 'Çerez Politikası',
    seoTitle: 'Çerez Politikası · Villa Sepeti',
    seoDescription:
      'Villa Sepeti sitesinde kullanılan çerezlerin türleri, amaçları ve yönetimine ilişkin politika.',
    sections: [
      {
        type: 'textContent',
        content: {
          intro:
            'Sitemizi ziyaret ettiğinizde deneyiminizi iyileştirmek için çerezler kullanırız. Bu politika, hangi çerezlerin ne amaçla kullanıldığını ve nasıl yönetebileceğinizi açıklar.',
          items: [
            {
              title: 'Çerez nedir?',
              body:
                'Çerezler, bir web sitesini ziyaret ettiğinizde tarayıcınıza kaydedilen küçük metin dosyalarıdır. Tercihlerinizi hatırlayarak siteyi daha hızlı ve kullanışlı hâle getirirler.',
            },
            {
              title: 'Kullandığımız çerez türleri',
              body:
                'Sitemizde üç temel çerez grubu kullanılır:\n· Zorunlu çerezler: sitenin çalışması için gereklidir\n· İşlevsel çerezler: tercihlerinizi ve oturumunuzu hatırlar\n· Analitik ve pazarlama çerezleri: kullanımı anlamamızı ve deneyimi kişiselleştirmemizi sağlar',
            },
            {
              title: 'Zorunlu çerezler',
              body:
                'Oturum açma, rezervasyon süreci ve güvenlik önlemleri gibi temel işlevler için kullanılır. Bu çerezler kapatılırsa sitenin bazı bölümleri düzgün çalışmayabilir.',
            },
            {
              title: 'İşlevsel çerezler',
              body:
                'Dil tercihiniz, arama filtreleriniz ve sepetiniz gibi seçimlerinizi hatırlayarak bir sonraki ziyaretinizde size zaman kazandırır.',
            },
            {
              title: 'Analitik ve pazarlama çerezleri',
              body:
                'Hangi sayfaların daha çok ilgi gördüğünü anlamamızı ve içeriğimizi geliştirmemizi sağlar. Bu çerezler sayesinde toplanan veriler anonimdir; sizi doğrudan tanımlamaz.',
            },
            {
              title: 'Üçüncü taraf çerezler',
              body:
                'Analitik ve reklam hizmetleri için kullandığımız bazı araçlar kendi çerezlerini yerleştirebilir. Bu araçların veri işleme politikaları için ilgili sağlayıcıların gizlilik metinlerine başvurabilirsiniz.',
            },
            {
              title: 'Çerezleri nasıl yönetebilirsiniz?',
              body:
                'Tarayıcınızın ayarlarından çerezleri silebilir veya engelleyebilirsiniz. Tarayıcıya göre adımlar değişir: Chrome, Safari, Firefox ve Edge için “çerez ayarları” bölümünde çerez tercihlerinizi düzenleyebilirsiniz.',
            },
            {
              title: 'Güncellemeler ve iletişim',
              body:
                'Bu politika, hizmetlerimizdeki değişikliklere göre güncellenebilir; güncel hâli her zaman bu sayfada yayındadır. Sorularınız için merhaba@villasepeti.com adresine yazabilirsiniz.',
            },
          ],
        },
      },
    ],
  },
  {
    slug: 'kullanim-kosullari',
    title: 'Kullanım Koşulları',
    seoTitle: 'Kullanım Koşulları · Villa Sepeti',
    seoDescription:
      'Villa Sepeti web sitesinin ve rezervasyon hizmetlerinin kullanımına ilişkin koşullar.',
    sections: [
      {
        type: 'textContent',
        content: {
          intro:
            'Bu sayfayı kullanarak aşağıdaki koşulları kabul etmiş sayılırsınız. Lütfen rezervasyon yapmadan önce dikkatlice okuyun.',
          items: [
            {
              title: 'Kapsam',
              body:
                'Bu koşullar; Villa Sepeti web sitesine erişiminizi ve sitede sunulan villa kiralama hizmetlerini düzenler. Siteyi kullanmaya devam etmeniz, koşulları kabul ettiğiniz anlamına gelir.',
            },
            {
              title: 'Hesap ve rezervasyon',
              body:
                'Rezervasyon yapabilmek için doğru ve güncel bilgilerle hesap oluşturmanız gerekir. Hesabınızın güvenliğinden siz sorumlusunuz. Rezervasyon, onayınızın tarafımızca bildirilmesiyle kesinleşir.',
            },
            {
              title: 'Fiyatlar ve ödemeler',
              body:
                'Sitede gösterilen fiyatlar, villa sayfasında belirtilen kapsam ve sezon koşulları için geçerlidir. Rezervasyon onayındaki tutar kesindir; onay sonrası fiyat değişikliği yapılmaz. Ödemeler, rezervasyon onayınızda belirtilen yöntem ve plana göre tahsil edilir.',
            },
            {
              title: 'İçerik ve fikri mülkiyet',
              body:
                'Sitedeki görseller, metinler ve marka unsurları şirketimize veya ilgili hak sahiplerine aittir. İzinsiz kopyalanamaz, çoğaltılamaz veya ticari amaçla kullanılamaz.',
            },
            {
              title: 'Sorumluluğun sınırı',
              body:
                'Sitedeki bilgiler özenle hazırlanmakla birlikte, teknik aksaklıklar nedeniyle geçici erişim sorunları yaşanabilir. Villa kaynaklı aksaklıklarda sorumluluğumuz, rezervasyon koşullarında ve İptal Koşulları sayfasında tanımlanan kapsamla sınırlıdır.',
            },
            {
              title: 'Uygulanacak hukuk',
              body:
                'Bu koşullar Türkiye Cumhuriyeti hukukuna tabidir. Uyuşmazlıklarda öncelikle İstanbul Anadolu Mahkemeleri ve İcra Daireleri yetkilidir.',
            },
            {
              title: 'Değişiklikler',
              body:
                'Bu koşulları, hizmetlerimizdeki değişikliklere uyum sağlamak için güncelleyebiliriz. Güncel sürüm her zaman bu sayfada yayındadır; önemli değişikliklerde kayıtlı kullanıcılarımızı e-posta ile bilgilendiririz.',
            },
          ],
        },
      },
    ],
  },
];
