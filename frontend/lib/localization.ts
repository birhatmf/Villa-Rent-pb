export function localizeContent(content: Record<string, any>, locale: string) {
  if (locale === 'tr') return content;
  const translated = content.i18n?.[locale];
  const merged = translated && typeof translated === 'object' && !Array.isArray(translated)
    ? deepMerge(content, translated)
    : content;
  return translateTree(merged, locale);
}

/** Existing seeded copy stays usable in English until an editor saves a custom translation. */
const DEFAULT_EN: Record<string, string> = {
  'Türkiye’nin seçkin kiralık villaları': 'Turkey’s hand-picked rental villas',
  'Kiralık Villa · Denize Sıfır Özel Havuzlu Villalar': 'Rental Villas · Beachfront Villas with Private Pools',
  'Kaş, Kalkan, Bodrum, Fethiye ve daha fazlasında bizzat gezilmiş, özel havuzlu kiralık villalar.': 'Personally inspected rental villas with private pools in Kaş, Kalkan, Bodrum, Fethiye and beyond.',
  'Kalabalıktan uzakta,\nyalnızca size ait bir yaz': 'Far from the crowds,\na summer all your own',
  'Her villayı biz gezdik, biz fotoğrafladık. Listede yalnızca kendimizin kalacağı evler var.': 'We visit and photograph every villa ourselves. We only list homes where we would gladly stay.',
  'Bölge veya villa adı': 'Destination or villa name',
  'Villa ara': 'Search villas',
  'Bizzat gezilmiş villa': 'Personally inspected villas',
  'Bölge': 'Destinations',
  'Ortalama misafir puanı': 'Average guest rating',
  'Tekrar konaklama': 'Return stays',
  'Bölgeler': 'Destinations',
  'Nereye gitmek istersiniz?': 'Where would you like to go?',
  'Konseptler': 'Collections',
  'Size uygun konsepti keşfedin': 'Find the collection for you',
  'Seçkiler': 'Collections',
  'Bu sezonun öne çıkanları': 'Highlights of the season',
  'Editörlerimizin bu yaz için ayırdığı evler.': 'Homes selected by our editors for this summer.',
  'Tüm villaları gör': 'View all villas',
  'Nasıl çalışıyoruz': 'How we work',
  'Katalog değil, kürasyon': 'Curation over volume',
  'Portföyümüze giren her ev için bir gece kalıyoruz. Suyun basıncını, akşam ışığının nereye düştüğünü, komşunun ne kadar yakın olduğunu biliyoruz. Beğenmediğimiz evi listeye almıyoruz — bu yüzden listemiz kısa.': 'We spend a night in every home that joins our collection. We check the water pressure, the evening light and the distance to the neighbours. Our list stays short because we only publish homes we trust.',
  'Hikâyemiz': 'Our story',
  'Rezervasyondan çıkışa kadar yanınızdayız': 'With you from booking to check-out',
  'Güvenli ödeme': 'Secure payment',
  'Ödemeniz giriş gününe kadar havuz hesapta tutulur.': 'Your payment is held securely until check-in.',
  'Karşılama servisi': 'Welcome service',
  'Villada sizi bir ev sorumlusu karşılar, anahtarı elden teslim eder.': 'A local host welcomes you at the villa and hands over the keys.',
  '7/24 destek': '24/7 support',
  'Konaklama boyunca tek bir numara; klimadan tekne turuna kadar.': 'One number throughout your stay, from air conditioning to boat trips.',
  'Girişte temizlik': 'Professionally cleaned',
  'Her konaklama öncesi profesyonel temizlik ve çarşaf değişimi.': 'Professional cleaning and fresh linen before every stay.',
  'Misafirler': 'Guests',
  'Dönüşte yazdıkları': 'What guests say after returning home',
  'Fotoğraflar villayı olduğundan güzel göstermiyordu — tam tersi. Terasta geçirdiğimiz akşamlar için ayrı teşekkür.': 'The photos did not make the villa look better than it was — quite the opposite. We especially loved our evenings on the terrace.',
  'Villa Meltem, Ağustos': 'Villa Meltem, August',
  'Üç aile birlikte kaldık, kimse birbirini rahatsız etmedi. Ev sorumlusu ilk gün pazara götürdü bizi.': 'Three families stayed together and everyone had their own space. Our host even took us to the market on the first day.',
  'Villa Zeytin, Temmuz': 'Villa Zeytin, July',
  'Havuz ısıtmalıydı, ekim ayında bile yüzdük. Rezervasyon tarafında hiç sürprizle karşılaşmadık.': 'The pool was heated, so we swam even in October. The booking process had no surprises.',
  'Villa Göl, Ekim': 'Villa Göl, October',
  'Ev sahipleri için': 'For hosts',
  'Villanızı doğru misafirle buluşturalım': 'Let us match your villa with the right guests',
  'Portföyümüz seçkin olduğu için talep yüksek. Evinizi değerlendirelim, size doluluk ve fiyat öngörüsü çıkaralım.': 'Our focused collection attracts strong demand. Let us assess your home and prepare an occupancy and pricing forecast.',
  'Villanızı listeleyin': 'List your villa',
  'Bize ulaşın': 'Contact us',
  'Yeni villalardan ilk siz haberdar olun': 'Be the first to hear about new villas',
  'Sezon açılışları ve erken rezervasyon fırsatları için ayda bir e‑posta.': 'One monthly email with season openings and early-booking opportunities.',
  'E‑posta adresiniz': 'Your email address',
  'Kaydol': 'Subscribe',
  'Bizzat gezilmiş, kürasyonla seçilmiş kiralık villalar. Kısa bir liste, uzun bir tatil.': 'Personally inspected, carefully selected rental villas. A short list for a long holiday.',
  'İletişim': 'Contact',
  'Haritada göster': 'View on map',
  'Keşfet': 'Explore',
  'Tüm villalar': 'All villas',
  'Denize sıfır': 'Beachfront',
  'Balayı villaları': 'Honeymoon villas',
  'Kış konaklaması': 'Winter stays',
  'Korunaklı villalar': 'Secluded villas',
  'Kurumsal': 'Company',
  'Hakkımızda': 'About us',
  'Sıkça sorulanlar': 'Frequently asked questions',
  'İptal koşulları': 'Cancellation policy',
  'KVKK Aydınlatma Metni': 'Data protection notice',
  'Gizlilik Politikası': 'Privacy policy',
  'Çerez Politikası': 'Cookie policy',
  'Kullanım Koşulları': 'Terms of use',
  '© {year} {company}. Tüm hakları saklıdır.': '© {year} {company}. All rights reserved.',
  'Merhaba, villa kiralama hakkında bilgi almak istiyorum.': 'Hello, I would like information about renting a villa.',
  'WhatsApp’tan yazın': 'Message us on WhatsApp',
  'Sakin koylar, taş evler': 'Quiet coves and stone houses',
  'Sonsuzluk havuzları': 'Infinity pools',
  'Beyaz badana, bitmeyen yaz': 'Whitewashed walls and endless summer',
  'Çam ormanı ve deniz': 'Pine forests and the sea',
  'Rüzgâr ve turkuaz': 'Sea breeze and turquoise water',
  'Toroslar’ın eteğinde': 'At the foot of the Taurus Mountains',
  'Göl kenarı bungalovlar': 'Lakeside bungalows',
  'Arnavut kaldırımı sokaklar': 'Cobblestone streets',
  'Kumsala birkaç adım': 'A few steps from the beach',
  'Yalnızca ikiniz için': 'Made for two',
  'Şömine ve sıcak havuz': 'Fireplaces and heated pools',
  'Dışarıdan görünmeyen': 'Complete privacy',
  'Denize Sıfır': 'Beachfront',
  'Balayı Villaları': 'Honeymoon Villas',
  'Kış Konaklaması': 'Winter Stays',
  'Korunaklı Villalar': 'Secluded Villas',
  'Plaja yürüme mesafesindeki villalar — sabah kahvesini kumda içmek isteyenler için.': 'Villas within walking distance of the beach, for mornings that begin on the sand.',
  'Mahremiyeti yüksek, romantik detaylarla donatılmış villalar.': 'Private villas designed with thoughtful details for two.',
  'Kapalı/ısıtmalı havuzu, şöminesi olan; kış aylarında da konaklanabilen villalar.': 'Villas with indoor or heated pools and fireplaces for year-round stays.',
  'Havuz terası ve bahçesi çevre duvarlarla kapalı, tam mahremiyet sunan villalar.': 'Villas with screened pool terraces and gardens for complete privacy.',
  'Yarımadanın ucunda, denize sıfır terası ve korunaklı sonsuzluk havuzuyla.': 'At the tip of the peninsula, with a waterfront terrace and secluded infinity pool.',
  'Kalkan limanına bakan üç teraslı taş villa; akşam güneşi tam salonun içine düşer.': 'A three-terrace stone villa overlooking Kalkan harbour, filled with evening light.',
  'Yüz yıllık zeytinliğin içinde, taş ve ahşabın sakin dili.': 'A calm blend of stone and timber in a century-old olive grove.',
  'Çam kokulu bahçe, korunaklı havuz ve Babadağ manzarası.': 'A pine-scented garden, secluded pool and views of Babadağ.',
  'Beyaz kireç duvarlar, gölgeli avlu ve rüzgâra açık bir teras.': 'White limewashed walls, a shaded courtyard and a breezy terrace.',
  'Tarihî surların içinde restore edilmiş konak; şehrin ortasında tam sessizlik.': 'A restored residence inside the historic walls, peaceful at the heart of the city.',
  'Kış aylarında da açık kapalı havuz, şömine ve göle bakan geniş balkon.': 'An indoor pool open through winter, a fireplace and a wide lake-view balcony.',
  'Taş duvarlı bahçe, hasır gölgelik ve iki adım ötede kum.': 'A stone-walled garden, woven shade and the beach just steps away.',
  'Özel havuz': 'Private pool',
  'Deniz manzarası': 'Sea view',
  'Klima': 'Air conditioning',
  'Barbekü': 'Barbecue',
  'Otopark': 'Parking',
  'Bulaşık makinesi': 'Dishwasher',
  'Jakuzi': 'Jacuzzi',
};

export function translateDefaultText(value: string, locale: string) {
  if (locale !== 'en') return value;
  if (value.endsWith('Tüm hakları saklıdır.')) return value.replace('Tüm hakları saklıdır.', 'All rights reserved.');
  return DEFAULT_EN[value] ?? value;
}

function translateTree(value: any, locale: string): any {
  if (typeof value === 'string') return translateDefaultText(value, locale);
  if (Array.isArray(value)) return value.map((item) => translateTree(item, locale));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'i18n' ? item : translateTree(item, locale)]));
}

function deepMerge(base: Record<string, any>, translated: Record<string, any>): Record<string, any> {
  const result = { ...base, ...translated };
  for (const [key, value] of Object.entries(translated)) {
    if (
      value && typeof value === 'object' && !Array.isArray(value)
      && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], value);
    }
  }
  return result;
}

export function setContentTranslation(
  content: Record<string, any>,
  locale: string,
  translated: Record<string, any>,
) {
  const { i18n: _ignored, ...clean } = translated;
  return {
    ...content,
    i18n: {
      ...(content.i18n ?? {}),
      [locale]: clean,
    },
  };
}
