"use client";
import { useEffect, useState } from 'react';
import axios from 'axios';

const normalizeArabicText = (text: string) => {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة التشكيل
    .replace(/[أإآٱ]/g, 'ا') // توحيد الألف
    .replace(/ة/g, 'ه') // توحيد التاء المربوطة والهاء
    .replace(/ي/g, 'ى'); // توحيد الياء والألف المقصورة
};

export default function Home() {
  const [surahs, setSurahs] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [pageAyahs, setPageAyahs] = useState<any[]>([]);
  const [savedPage, setSavedPage] = useState<number | null>(null);
  const [pageInput, setPageInput] = useState('');
  const [theme, setTheme] = useState('light'); // 'light' | 'dark' | 'sepia'
  const [flipKey, setFlipKey] = useState(0);
  // حالات البحث
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // حالات التحميل والتفسير والترجمة
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [expandedTafsir, setExpandedTafsir] = useState<Record<number, boolean>>({});
  const [showTranslation, setShowTranslation] = useState(false);

  // حالات التنقل الرئيسية والأذكار والفتاوى
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [adhkarData, setAdhkarData] = useState<any[]>([]);
  const [selectedAdhkarCategory, setSelectedAdhkarCategory] = useState<string | null>(null);
  const [adhkarCounts, setAdhkarCounts] = useState<Record<string, number>>({});
  
  const [fatawaData, setFatawaData] = useState<any[]>([]);
  const [selectedFatawaCategory, setSelectedFatawaCategory] = useState<string | null>(null);
  const [expandedFatawa, setExpandedFatawa] = useState<Record<number, boolean>>({});

  // حالات بطاقة السورة
  const [surahInfoData, setSurahInfoData] = useState<Record<number, string>>({});
  const [selectedSurah, setSelectedSurah] = useState<any | null>(null);

  // حالة مشغل الصوت المستقل
  const [playingAudioSurah, setPlayingAudioSurah] = useState<number | null>(null);

  // جلب قائمة السور والأذكار ومعرفة الصفحة المحفوظة والوضع الداكن عند فتح الموقع
  useEffect(() => {
    axios.get('https://api.alquran.cloud/v1/surah')
      .then(response => setSurahs(response.data.data))
      .catch(error => console.error(error));

    // جلب بيانات الأذكار من حصن المسلم
    axios.get('https://raw.githubusercontent.com/rn0x/Adhkar-json/main/adhkar.json')
      .then(response => setAdhkarData(response.data))
      .catch(error => console.error(error));

    // جلب بيانات الفتاوى والأحكام
    axios.get('/data/fatawa.json')
      .then(response => setFatawaData(response.data))
      .catch(error => console.error('Error loading fatawa', error));

    // جلب معلومات السور (سبب النزول ونبذة)
    axios.get('/data/surah_info.json')
      .then(response => setSurahInfoData(response.data))
      .catch(error => console.error('Error loading surah info', error));

    const saved = localStorage.getItem('quran_saved_page');
    if (saved) {
      setSavedPage(parseInt(saved));
    }

    // تحميل تفضيل المظهر من localStorage وتطبيقه
    try {
      const savedTheme = localStorage.getItem('quran_theme') || 'light';
      setTheme(savedTheme);
      applyTheme(savedTheme);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // تحديث عنوان التبويبة بناءً على القسم النشط
  useEffect(() => {
    let title = "تفيُّؤ";
    if (currentPage !== null) {
      title = `تفيُّؤ | المصحف - صفحة ${currentPage}`;
    } else if (activeSection === 'quran') {
      title = "تفيُّؤ | القرآن الكريم";
    } else if (activeSection === 'adhkar') {
      title = "تفيُّؤ | الأذكار والأدعية";
    } else if (activeSection === 'fatawa') {
      title = "تفيُّؤ | الأحكام والفتاوى";
    }
    document.title = title;
  }, [activeSection, currentPage]);

  const applyTheme = (newTheme: string) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('dark', 'theme-sepia');
      if (newTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (newTheme === 'sepia') {
        document.documentElement.classList.add('theme-sepia');
      }
    }
  };

  // دالة لجلب وعرض صفحة معينة من المصحف (من 1 إلى 604)
  // تجلب النص العثماني والتفسير الميسر والترجمة الإنجليزية بالتوازي
  const loadPage = (pageNumber: number) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setIsLoadingPage(true);
    setExpandedTafsir({});
    setFlipKey(prev => prev + 1);
    Promise.all([
      axios.get(`https://api.alquran.cloud/v1/page/${pageNumber}/quran-uthmani`),
      axios.get(`https://api.alquran.cloud/v1/page/${pageNumber}/ar.muyassar`),
      axios.get(`https://api.alquran.cloud/v1/page/${pageNumber}/en.sahih`),
    ])
      .then(([uthmaniRes, tafsirRes, translationRes]) => {
        const uthmaniAyahs = uthmaniRes.data.data.ayahs;
        const tafsirAyahs = tafsirRes.data.data.ayahs;
        const translationAyahs = translationRes.data.data.ayahs;
        const merged = uthmaniAyahs.map((ayah: any, i: number) => ({
          ...ayah,
          tafsir: tafsirAyahs[i]?.text || '',
          translation: translationAyahs[i]?.text || '',
        }));
        setPageAyahs(merged);
        setCurrentPage(pageNumber);
      })
      .catch(error => console.error(error))
      .finally(() => setIsLoadingPage(false));
  };

  // دالة معرفة رقم صفحة بداية السورة عند الضغط عليها من القائمة
  const handleReadSurah = (surahNumber: number) => {
    setPlayingAudioSurah(surahNumber);
    axios.get(`https://api.alquran.cloud/v1/surah/${surahNumber}`)
      .then(response => {
        const firstAyahPage = response.data.data.ayahs[0].page;
        loadPage(firstAyahPage);
      })
      .catch(error => console.error(error));
  };

  // دوال التقليب
  const nextPage = () => {
    if (currentPage !== null && currentPage < 604) loadPage(currentPage + 1);
  };

  const prevPage = () => {
    if (currentPage !== null && currentPage > 1) loadPage(currentPage - 1);
  };

  // دالة حفظ الصفحة الحالية
  const saveCurrentPage = () => {
    if (currentPage) {
      localStorage.setItem('quran_saved_page', currentPage.toString());
      setSavedPage(currentPage);
      alert(`تم حفظ الصفحة رقم ${currentPage} بنجاح!`);
    }
  };

  // تبديل أوضاع القراءة الدورية
  const cycleTheme = () => {
    const themes = ['light', 'sepia', 'dark'];
    const nextIndex = (themes.indexOf(theme) + 1) % themes.length;
    const newTheme = themes[nextIndex];
    setTheme(newTheme);
    applyTheme(newTheme);
    try {
      localStorage.setItem('quran_theme', newTheme);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBack = () => {
    setCurrentPage(null);
    setPageAyahs([]);
    setExpandedTafsir({});
    setShowTranslation(false);
  };

  // دالة تبديل عرض التفسير لكل آية
  const toggleTafsir = (index: number) => {
    setExpandedTafsir(prev => ({ ...prev, [index]: !prev[index] }));
  };

  // دالة البحث في القرآن
  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setHasSearched(true);
    axios.get(`https://api.alquran.cloud/v1/search/${encodeURIComponent(searchQuery.trim())}/all/quran-simple-clean`)
      .then(response => {
        const matches = response.data.data?.matches || [];
        setSearchResults(matches);
      })
      .catch(error => {
        console.error(error);
        setSearchResults([]);
      })
      .finally(() => setIsSearching(false));
  };

  // مسح نتائج البحث
  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
  };

  // دالة العودة للصفحة الرئيسية
  const goToLanding = () => {
    setActiveSection(null);
    setCurrentPage(null);
    setPageAyahs([]);
    setExpandedTafsir({});
    setShowTranslation(false);
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setSelectedAdhkarCategory(null);
    setAdhkarCounts({});
    setPlayingAudioSurah(null);
  };

  // دالة اختيار فئة أذكار وتهيئة العداد
  const selectAdhkarCategory = (category: string) => {
    setSelectedAdhkarCategory(category);
    const categoryData = adhkarData.find((c: any) => c.category === category);
    if (categoryData) {
      const counts: Record<string, number> = {};
      categoryData.array.forEach((item: any) => {
        counts[`${category}-${item.id}`] = item.count || 1;
      });
      setAdhkarCounts(counts);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // دالة تقليل عداد الذكر عند الضغط
  const decrementAdhkar = (key: string) => {
    setAdhkarCounts(prev => {
      const current = prev[key] || 0;
      if (current <= 0) return prev;
      return { ...prev, [key]: current - 1 };
    });
  };

  // دالة أيقونة الفئة
  const getCategoryIcon = (cat: string): string => {
    if (cat.includes('صباح')) return '🌅';
    if (cat.includes('نوم') && !cat.includes('استيقاظ')) return '🌙';
    if (cat.includes('استيقاظ')) return '☀️';
    if (cat.includes('مسجد')) return '🕌';
    if (cat.includes('وضوء')) return '💧';
    if (cat.includes('طعام') || cat.includes('إفطار') || cat.includes('صائم')) return '🍽️';
    if (cat.includes('سفر') || cat.includes('مسافر')) return '✈️';
    if (cat.includes('منزل') || cat.includes('بيت')) return '🏠';
    if (cat.includes('كرب') || cat.includes('هم') || cat.includes('حزن')) return '🤲';
    if (cat.includes('استغفار') || cat.includes('توبة')) return '✨';
    if (cat.includes('تسبيح') || cat.includes('تحميد')) return '📿';
    if (cat.includes('ريح') || cat.includes('رعد') || cat.includes('مطر') || cat.includes('استسقاء') || cat.includes('استصحاء')) return '🌧️';
    if (cat.includes('حج') || cat.includes('عمرة') || cat.includes('عرفة') || cat.includes('جمار') || cat.includes('ركن')) return '🕋';
    if (cat.includes('خلاء')) return '🚪';
    if (cat.includes('أذان') || cat.includes('آذان')) return '📢';
    if (cat.includes('مريض') || cat.includes('عيادة')) return '💊';
    if (cat.includes('ميت') || cat.includes('قبر') || cat.includes('جنازة') || cat.includes('دفن') || cat.includes('محتضر') || cat.includes('تعزية')) return '🕊️';
    if (cat.includes('ثوب') || cat.includes('لبس')) return '👔';
    if (cat.includes('سوق')) return '🏪';
    if (cat.includes('نبي') || cat.includes('صلى الله') || cat.includes('صلاة على')) return '💚';
    if (cat.includes('هلال')) return '🌛';
    if (cat.includes('عطاس')) return '🤧';
    if (cat.includes('غضب')) return '😤';
    if (cat.includes('شيطان') || cat.includes('دجال') || cat.includes('وسوسة')) return '🛡️';
    if (cat.includes('سلام') || cat.includes('إفشاء')) return '👋';
    if (cat.includes('زوج') || cat.includes('متزوج')) return '💍';
    if (cat.includes('ركوب') || cat.includes('مركوب')) return '🚗';
    if (cat.includes('قنوت') || cat.includes('وتر')) return '🙏';
    if (cat.includes('قرية') || cat.includes('بلدة')) return '🏘️';
    if (cat.includes('صلاة') || cat.includes('سجود') || cat.includes('ركوع') || cat.includes('تشهد') || cat.includes('استفتاح') || cat.includes('جلسة')) return '🕌';
    if (cat.includes('فزع')) return '😰';
    if (cat.includes('رؤيا') || cat.includes('حلم')) return '💭';
    if (cat.includes('مولود') || cat.includes('أولاد')) return '👶';
    if (cat.includes('عدو') || cat.includes('سلطان') || cat.includes('ظلم')) return '⚔️';
    if (cat.includes('دين')) return '💰';
    if (cat.includes('ذنب') || cat.includes('أذنب')) return '🙇';
    if (cat.includes('مبتلى') || cat.includes('عين')) return '👁️';
    if (cat.includes('مجلس') || cat.includes('كفارة')) return '👥';
    if (cat.includes('آداب') || cat.includes('خير')) return '📖';
    return '📿';
  };

  // --------------------------------------------------------
  // الشاشة الثالثة: شاشة قراءة المصحف (الصفحات)
  // --------------------------------------------------------
  if (currentPage) {
    // استخراج رقم السورة من أول آية في الصفحة لضبط المشغل إذا لم يكن هناك سورة قيد التشغيل
    const currentSurahNumber = pageAyahs.length > 0 ? pageAyahs[0].surah?.number : null;
    const activeAudioSurah = playingAudioSurah || currentSurahNumber;

    return (
      <main className={`p-4 md:p-8 min-h-screen text-right bg-amber-50 dark:bg-gray-900 dark:text-gray-100 ${theme === 'dark' ? 'dark' : ''} ${theme === 'sepia' ? 'theme-sepia' : ''}`}  dir="rtl">
        <div className="max-w-4xl mx-auto">
          
          {/* شريط التحكم العلوي */}
          <div className="sticky top-0 z-50 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm p-4 rounded-xl shadow-md border border-amber-200 dark:border-amber-700 mb-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <button onClick={handleBack} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-bold transition">
                العودة للقائمة
              </button>
              <div className="flex gap-2 items-center flex-wrap">
                <button
                  onClick={() => setShowTranslation(prev => !prev)}
                  className={`px-4 py-2 rounded-lg font-bold transition ${
                    showTranslation
                      ? 'bg-sky-500 text-white hover:bg-sky-600'
                      : 'bg-sky-100 hover:bg-sky-200 text-sky-800 dark:bg-sky-900 dark:text-sky-300 dark:hover:bg-sky-800'
                  }`}
                >
                  🌐 {showTranslation ? 'عربي' : 'English'}
                </button>
                <button onClick={saveCurrentPage} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-4 py-2 rounded-lg font-bold transition">
                  🔖 حفظ العلامة
                </button>
                <button onClick={cycleTheme} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-bold transition">
                  {theme === 'dark' ? '🌙 داكن' : theme === 'sepia' ? '📜 كلاسيكي' : '☀️ فاتح'}
                </button>
              </div>
            </div>

            {/* مشغل صوت ياسر الدوسري */}
            {activeAudioSurah && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-amber-200 dark:border-amber-600">
                <span className="text-sm font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">🎧 الشيخ ياسر الدوسري</span>
                <audio
                  controls
                  key={activeAudioSurah}
                  preload="auto"
                  className="w-full mt-2"
                  onPlay={(e) => {
                    const audios = document.getElementsByTagName('audio');
                    for (let i = 0; i < audios.length; i++) {
                      if (audios[i] !== e.target) audios[i].pause();
                    }
                  }}
                  src={`https://server11.mp3quran.net/yasser/${String(activeAudioSurah).padStart(3, '0')}.mp3`}
                >
                  متصفحك لا يدعم تشغيل الصوت.
                </audio>
              </div>
            )}
          </div>

          {/* حالة التحميل */}
          {isLoadingPage && (
            <div className="flex items-center justify-center min-h-[60vh]">
              <p className="text-2xl text-emerald-600 dark:text-emerald-400 font-bold animate-pulse">جاري تحميل الصفحة...</p>
            </div>
          )}
          
          {/* ورقة المصحف */}
          {!isLoadingPage && (
          <div key={flipKey} className="page-flip-enter quran-frame classic-frame bg-white dark:bg-gray-800">
            <div className="quran-block">
              {pageAyahs.map((ayah, index) => (
                <span key={index} className="inline">
                  {/* ترويسة السورة وبسملتها */}
                  {ayah.numberInSurah === 1 && (
                    <div className="w-full">
                      <div className="surah-header-classic">سُورَةُ {ayah.surah?.name.replace('سُورَةُ ', '')}</div>
                      {ayah.surah?.number !== 1 && ayah.surah?.number !== 9 && (
                        <div className="text-center font-bold text-2xl mb-4 quran-text">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>
                      )}
                    </div>
                  )}

                  <span className="text-3xl md:text-4xl quran-text text-gray-900 dark:text-gray-100 leading-[3rem] md:leading-[4rem]">
                    {/* إزالة البسملة من نص الآية الأولى إن وجدت لعدم التكرار */}
                    {ayah.numberInSurah === 1 && ayah.surah?.number !== 1 ? ayah.text.replace('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', '').trim() : ayah.text}
                  </span>
                  
                  <span className="ayah-marker text-amber-700 dark:text-amber-500">
                    {ayah.numberInSurah}
                  </span>

                  {/* زر التفسير لكل آية */}
                  <span className="inline-flex mx-1 align-middle">
                    <button
                      onClick={() => toggleTafsir(index)}
                      className={`text-xs px-2.5 py-1 rounded-full font-bold transition ${
                        expandedTafsir[index]
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-300 dark:hover:bg-amber-800'
                      }`}
                    >
                      📖 التفسير
                    </button>
                  </span>

                  {/* بطاقة التفسير */}
                  {expandedTafsir[index] && ayah.tafsir && (
                    <div className="block my-3 mx-auto w-full text-right p-4 rounded-lg bg-amber-50 dark:bg-gray-700 border border-amber-200 dark:border-amber-600 shadow-sm" style={{ textAlign: 'right' }}>
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-2">📖 التفسير الميسر</p>
                      <p className="text-base leading-8 text-gray-800 dark:text-gray-200 font-sans">{ayah.tafsir}</p>
                    </div>
                  )}

                  {/* الترجمة الإنجليزية */}
                  {showTranslation && ayah.translation && (
                    <div className="block my-1 text-left" dir="ltr" style={{ textAlign: 'left' }}>
                      <p className="text-sm leading-6 text-gray-500 dark:text-gray-400 italic font-sans">{ayah.translation}</p>
                    </div>
                  )}
                </span>
              ))}
            </div>
            
            {/* رقم الصفحة في أسفل الورقة */}
            <div className="mt-12 text-center text-amber-700 font-bold text-lg border-t pt-4 border-amber-200 dark:border-amber-700">
              {currentPage}
            </div>
          </div>
          )}

          {/* أزرار التقليب (السابق والتالي) مع قفز للصفحة */}
          <div className="flex flex-col md:flex-row justify-between items-center mt-8 gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={prevPage}
                disabled={currentPage === 1}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-bold transition disabled:opacity-50"
              >
                ➡️ الصفحة السابقة
              </button>
              <button
                onClick={nextPage}
                disabled={currentPage === 604}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-bold transition disabled:opacity-50"
              >
                الصفحة التالية ⬅️
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300">الذهاب إلى الصفحة:</label>
              <input
                type="number"
                min={1}
                max={604}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                className="w-24 p-2 border rounded-lg text-center dark:bg-gray-700 dark:text-white"
                placeholder="1-604"
              />
              <button
                onClick={() => {
                  const num = parseInt(pageInput);
                  if (!isNaN(num) && num >= 1 && num <= 604) {
                    loadPage(num);
                    setPageInput('');
                  } else {
                    alert('أدخل رقم صفحة صحيح بين 1 و 604');
                  }
                }}
                className="bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 px-4 py-2 rounded-lg font-bold transition"
              >
                اذهب
              </button>
            </div>
          </div>

        </div>
      </main>
    );
  }

  // --------------------------------------------------------
  // صفحة الهبوط الرئيسية
  // --------------------------------------------------------
  if (!activeSection) {
    return (
      <main className={`min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6 ${theme === 'dark' ? 'dark' : ''} ${theme === 'sepia' ? 'theme-sepia' : ''}`}  dir="rtl">
        <div className="max-w-4xl w-full mx-auto text-center">
          <h1 className="text-6xl md:text-8xl font-bold text-emerald-700 dark:text-emerald-400 mb-3 leading-tight">﷽</h1>
          <p className="text-lg md:text-xl text-gray-500 dark:text-gray-400 mb-4">تطبيقك الإسلامي الشامل</p>
          <button onClick={cycleTheme} className="mb-10 inline-flex items-center gap-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-700 dark:text-gray-300 px-5 py-2.5 rounded-full text-sm font-bold shadow-sm border border-gray-200 dark:border-gray-700 transition hover:shadow-md">
            {theme === 'dark' ? '🌙 الوضع الداكن' : theme === 'sepia' ? '📜 الوضع الكلاسيكي' : '☀️ الوضع الفاتح'}
          </button>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* كارت القرآن الكريم */}
            <button
              onClick={() => setActiveSection('quran')}
              className="group bg-white dark:bg-gray-800 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl p-10 shadow-lg hover:shadow-2xl hover:scale-[1.03] transition-all duration-300 text-center cursor-pointer"
            >
              <span className="text-7xl block mb-6 group-hover:scale-110 transition-transform duration-300">📖</span>
              <h2 className="text-3xl font-bold text-emerald-700 dark:text-emerald-400 mb-3">القرآن الكريم</h2>
              <p className="text-gray-500 dark:text-gray-400 leading-7">المصحف الشريف · التفسير الميسر · الترجمة الإنجليزية · تلاوة الشيخ ياسر الدوسري</p>
            </button>

            {/* كارت الأذكار والأدعية */}
            <button
              onClick={() => setActiveSection('adhkar')}
              className="group bg-white dark:bg-gray-800 border-2 border-amber-200 dark:border-amber-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:scale-[1.03] transition-all duration-300 text-center cursor-pointer"
            >
              <span className="text-6xl block mb-6 group-hover:scale-110 transition-transform duration-300">📿</span>
              <h2 className="text-2xl font-bold text-amber-700 dark:text-amber-400 mb-3">الأذكار والأدعية</h2>
              <p className="text-gray-500 dark:text-gray-400 leading-7 text-sm">حصن المسلم · أذكار الصباح والمساء · عداد التسبيح · أدعية يومية</p>
            </button>

            {/* كارت الأحكام والفتاوى */}
            <button
              onClick={() => setActiveSection('fatawa')}
              className="group bg-white dark:bg-gray-800 border-2 border-sky-200 dark:border-sky-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:scale-[1.03] transition-all duration-300 text-center cursor-pointer"
            >
              <span className="text-6xl block mb-6 group-hover:scale-110 transition-transform duration-300">⚖️</span>
              <h2 className="text-2xl font-bold text-sky-700 dark:text-sky-400 mb-3">الأحكام والفتاوى</h2>
              <p className="text-gray-500 dark:text-gray-400 leading-7 text-sm">أحكام دينية في الحياة · الحلال والحرام · العبادات · المعاملات المالية</p>
            </button>
          </div>

          {/* زر إكمال القراءة إذا كان هناك صفحة محفوظة */}
          {savedPage && (
            <div className="mt-10">
              <button
                onClick={() => { setActiveSection('quran'); loadPage(savedPage); }}
                className="bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 px-6 py-3 rounded-full font-bold shadow-sm transition"
              >
                📖 إكمال القراءة من صفحة ({savedPage})
              </button>
            </div>
          )}

        </div>
      </main>
    );
  }

  // --------------------------------------------------------
  // قسم الأذكار والأدعية - عرض أذكار فئة محددة
  // --------------------------------------------------------
  if (activeSection === 'adhkar' && selectedAdhkarCategory) {
    const categoryData = adhkarData.find((c: any) => c.category === selectedAdhkarCategory);
    return (
      <main className={`p-4 md:p-8 min-h-screen text-right bg-emerald-50 dark:bg-gray-900 dark:text-gray-100 ${theme === 'dark' ? 'dark' : ''} ${theme === 'sepia' ? 'theme-sepia' : ''}`}  dir="rtl">
        <div className="max-w-3xl mx-auto">
          {/* شريط التحكم */}
          <div className="sticky top-0 z-50 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm flex flex-wrap justify-between items-center mb-6 gap-3 p-4 rounded-xl shadow-sm border border-emerald-200 dark:border-emerald-700">
            <button onClick={() => { setSelectedAdhkarCategory(null); setAdhkarCounts({}); }} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-bold transition">
              ↩️ رجوع للفئات
            </button>
            <div className="flex gap-2">
              <button onClick={goToLanding} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-4 py-2 rounded-lg font-bold transition">
                🏠 الرئيسية
              </button>
              <button onClick={cycleTheme} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-bold transition">
                {theme === 'dark' ? '🌙' : theme === 'sepia' ? '📜' : '☀️'}
              </button>
            </div>
          </div>

          <h2 className="text-2xl md:text-3xl font-bold text-emerald-700 dark:text-emerald-400 text-center mb-8">
            {getCategoryIcon(selectedAdhkarCategory)} {selectedAdhkarCategory}
          </h2>

          <div className="space-y-5">
            {categoryData?.array.map((item: any, idx: number) => {
              const key = `${selectedAdhkarCategory}-${item.id}`;
              const remaining = adhkarCounts[key] ?? item.count ?? 1;
              const done = remaining <= 0;
              return (
                <div
                  key={idx}
                  onClick={() => !done && decrementAdhkar(key)}
                  className={`bg-white dark:bg-gray-800 border-2 rounded-2xl p-6 transition-all duration-300 cursor-pointer select-none ${
                    done
                      ? 'border-emerald-400 dark:border-emerald-600 opacity-50 scale-[0.98]'
                      : 'border-gray-200 dark:border-gray-700 hover:shadow-lg active:scale-[0.97] hover:border-emerald-300'
                  }`}
                >
                  <p className="text-xl md:text-2xl leading-[2.8rem] text-gray-900 dark:text-gray-100 mb-5">{item.text}</p>
                  <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-gray-700">
                    {done ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold text-lg animate-pulse">✅ تم بحمد الله</span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300 w-12 h-12 rounded-full font-bold text-xl flex items-center justify-center shadow-sm">
                          {remaining}
                        </span>
                        <span className="text-sm text-gray-400">باقي</span>
                      </div>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500">👆 اضغط للتسبيح</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  // --------------------------------------------------------
  // قسم الأذكار والأدعية - عرض فئات الأذكار
  // --------------------------------------------------------
  if (activeSection === 'adhkar') {
    return (
      <main className={`p-6 md:p-8 min-h-screen text-right bg-gradient-to-b from-emerald-50 to-white dark:from-gray-900 dark:to-gray-800 dark:text-gray-100 ${theme === 'dark' ? 'dark' : ''} ${theme === 'sepia' ? 'theme-sepia' : ''}`}  dir="rtl">
        <div className="max-w-5xl mx-auto">
          {/* شريط التحكم */}
          <div className="flex flex-wrap justify-between items-center mb-8 gap-3">
            <button onClick={goToLanding} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-bold transition">
              🏠 الرئيسية
            </button>
            <h1 className="text-3xl md:text-4xl font-bold text-emerald-700 dark:text-emerald-400">📿 الأذكار والأدعية</h1>
            <button onClick={cycleTheme} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-bold transition">
              {theme === 'dark' ? '🌙 داكن' : theme === 'sepia' ? '📜 كلاسيكي' : '☀️ فاتح'}
            </button>
          </div>

          <p className="text-center text-gray-500 dark:text-gray-400 mb-8">من كتاب حصن المسلم · اختر فئة للبدء</p>

          {/* شبكة فئات الأذكار */}
          {adhkarData.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-xl text-emerald-600 dark:text-emerald-400 font-bold animate-pulse">جاري تحميل الأذكار...</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {adhkarData.map((cat: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => selectAdhkarCategory(cat.category)}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 text-center shadow-sm hover:shadow-lg hover:scale-[1.04] hover:border-emerald-300 dark:hover:border-emerald-600 transition-all duration-200 cursor-pointer"
                >
                  <span className="text-4xl block mb-3">{getCategoryIcon(cat.category)}</span>
                  <p className="font-bold text-sm text-gray-800 dark:text-gray-200 leading-6">{cat.category}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{cat.array.length} ذكر</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  // --------------------------------------------------------
  // قسم الأحكام والفتاوى الدينية
  // --------------------------------------------------------
  if (activeSection === 'fatawa') {
    if (selectedFatawaCategory) {
      const categoryData = fatawaData.find((c: any) => c.category === selectedFatawaCategory);
      return (
        <main className={`p-4 md:p-8 min-h-screen text-right bg-sky-50 dark:bg-gray-900 dark:text-gray-100 ${theme === 'dark' ? 'dark' : ''} ${theme === 'sepia' ? 'theme-sepia' : ''}`}  dir="rtl">
          <div className="max-w-4xl mx-auto">
            {/* شريط التحكم */}
            <div className="sticky top-0 z-50 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm flex flex-wrap justify-between items-center mb-6 gap-3 p-4 rounded-xl shadow-sm border border-sky-200 dark:border-sky-700">
              <button onClick={() => { setSelectedFatawaCategory(null); setExpandedFatawa({}); }} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-bold transition">
                ↩️ رجوع للأقسام
              </button>
              <div className="flex gap-2">
                <button onClick={goToLanding} className="bg-sky-100 hover:bg-sky-200 text-sky-800 px-4 py-2 rounded-lg font-bold transition">
                  🏠 الرئيسية
                </button>
                <button onClick={cycleTheme} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-bold transition">
                  {theme === 'dark' ? '🌙' : theme === 'sepia' ? '📜' : '☀️'}
                </button>
              </div>
            </div>

            <h2 className="text-2xl md:text-4xl font-bold text-sky-700 dark:text-sky-400 text-center mb-8">
              {categoryData?.icon} {selectedFatawaCategory}
            </h2>

            <div className="space-y-4">
              {categoryData?.items?.map((item: any, idx: number) => (
                <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm transition hover:shadow-md">
                  <button
                    onClick={() => setExpandedFatawa(prev => ({ ...prev, [idx]: !prev[idx] }))}
                    className="w-full p-5 text-right flex justify-between items-center bg-sky-50/50 dark:bg-gray-800 hover:bg-sky-100 dark:hover:bg-gray-700 transition"
                  >
                    <h3 className="text-xl font-bold text-sky-900 dark:text-sky-100 leading-8">❓ {item.question}</h3>
                    <span className="text-2xl text-sky-600 ml-4">{expandedFatawa[idx] ? '➖' : '➕'}</span>
                  </button>
                  {expandedFatawa[idx] && (
                    <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                      <p className="text-lg leading-8 mb-4">💡 {item.answer}</p>
                      <span className="inline-block bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs px-3 py-1 rounded-full font-bold">
                        📚 المرجع: {item.reference}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </main>
      );
    }

    return (
      <main className={`p-6 md:p-8 min-h-screen text-right bg-gradient-to-b from-sky-50 to-white dark:from-gray-900 dark:to-gray-800 dark:text-gray-100 ${theme === 'dark' ? 'dark' : ''} ${theme === 'sepia' ? 'theme-sepia' : ''}`}  dir="rtl">
        <div className="max-w-5xl mx-auto">
          {/* شريط التحكم */}
          <div className="flex flex-wrap justify-between items-center mb-8 gap-3">
            <button onClick={goToLanding} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-bold transition">
              🏠 الرئيسية
            </button>
            <h1 className="text-3xl md:text-4xl font-bold text-sky-700 dark:text-sky-400">⚖️ الأحكام والفتاوى</h1>
            <button onClick={cycleTheme} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-bold transition">
              {theme === 'dark' ? '🌙' : theme === 'sepia' ? '📜' : '☀️'}
            </button>
          </div>

          <p className="text-center text-gray-500 dark:text-gray-400 mb-8">اختر تصنيفاً لعرض الأسئلة والأحكام المتعلقة به</p>

          {/* شبكة الفئات */}
          {fatawaData.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-xl text-sky-600 dark:text-sky-400 font-bold animate-pulse">جاري تحميل الأحكام...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fatawaData.map((cat: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setSelectedFatawaCategory(cat.category)}
                  className="bg-white dark:bg-gray-800 border-2 border-sky-100 dark:border-gray-700 rounded-2xl p-6 text-center shadow-sm hover:shadow-lg hover:scale-[1.03] hover:border-sky-300 dark:hover:border-sky-500 transition-all duration-300 cursor-pointer"
                >
                  <span className="text-5xl block mb-4">{cat.icon}</span>
                  <p className="font-bold text-2xl text-gray-800 dark:text-gray-100 mb-2">{cat.category}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{cat.items?.length} مسائل</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  // --------------------------------------------------------
  // قسم القرآن الكريم - القائمة الرئيسية
  // --------------------------------------------------------
  // تصفية السور المطابقة لاسم البحث محلياً
  const qNormalized = normalizeArabicText(searchQuery.trim());
  const surahMatches = qNormalized.length > 0 ? surahs.filter((s: any) =>
    normalizeArabicText(s.name).includes(qNormalized) || 
    normalizeArabicText(s.name.replace('سُورَةُ ', '')).includes(qNormalized) || 
    (s.englishName && s.englishName.toLowerCase().includes(searchQuery.trim().toLowerCase()))
  ) : [];

  return (
    <main className={`p-6 md:p-8 min-h-screen text-right bg-gray-50 dark:bg-gray-900 dark:text-gray-100 ${theme === 'dark' ? 'dark' : ''} ${theme === 'sepia' ? 'theme-sepia' : ''}`}  dir="rtl">
      <div className="max-w-7xl mx-auto mb-12">
        {/* الشريط العلوي */}
        <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
          <button onClick={goToLanding} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-bold transition">
            🏠 الرئيسية
          </button>
          <h1 className="text-3xl md:text-5xl font-bold text-emerald-700 dark:text-emerald-400">
            📖 القرآن الكريم
          </h1>
          <button onClick={cycleTheme} className="inline-flex items-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-full font-bold">
            {theme === 'dark' ? '🌙 داكن' : theme === 'sepia' ? '📜 كلاسيكي' : '☀️ فاتح'}
          </button>
        </div>

        {/* زر إكمال القراءة إذا كان هناك صفحة محفوظة */}
        {savedPage && (
          <div className="text-center mb-6">
            <button 
              onClick={() => loadPage(savedPage)} 
              className="bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 px-6 py-3 rounded-full font-bold shadow-sm transition"
            >
              📖 إكمال القراءة من صفحة ({savedPage})
            </button>
          </div>
        )}

        {/* قسم البحث في القرآن */}
        <div className="max-w-3xl mx-auto mt-4 mb-8 w-full">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 rounded-xl shadow-sm">
            <h2 className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mb-4 text-center">🔍 البحث في القرآن (بالآية أو اسم السورة)</h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="ابحث بكلمة من آية أو اسم سورة..."
                className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg text-right bg-gray-50 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-bold transition disabled:opacity-50"
              >
                بحث
              </button>
              {hasSearched && (
                <button
                  onClick={clearSearch}
                  className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-3 rounded-lg font-bold transition"
                >
                  مسح
                </button>
              )}
            </div>
          </div>

          {/* نتائج البحث الفورية في أسماء السور (بدون ضغط بحث) */}
          {!hasSearched && searchQuery.trim().length > 0 && surahMatches.length > 0 && (
            <div className="mt-4 bg-emerald-50 dark:bg-gray-800 border border-emerald-200 dark:border-emerald-700 rounded-xl p-4">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-3">📖 السور المطابقة ({surahMatches.length}):</p>
              <div className="flex flex-wrap gap-2">
                {surahMatches.map((s: any) => (
                  <button key={s.number} onClick={() => setSelectedSurah(s)}
                    className="bg-white dark:bg-gray-700 hover:bg-emerald-100 dark:hover:bg-gray-600 border border-emerald-200 dark:border-emerald-600 text-emerald-800 dark:text-emerald-300 px-4 py-2 rounded-lg font-bold transition text-sm">
                    سورة {s.name.replace('سُورَةُ ', '')} ({s.numberOfAyahs} آية)
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* حالة التحميل */}
          {isSearching && (
            <div className="text-center mt-6">
              <p className="text-xl text-emerald-600 dark:text-emerald-400 font-bold animate-pulse">جاري البحث...</p>
            </div>
          )}

          {/* عرض نتائج البحث */}
          {!isSearching && hasSearched && (
            <div className="mt-6 space-y-4">
              {/* نتائج أسماء السور */}
              {surahMatches.length > 0 && (
                <div className="bg-emerald-50 dark:bg-gray-800 border border-emerald-200 dark:border-emerald-700 rounded-xl p-4">
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-3">📖 السور المطابقة ({surahMatches.length}):</p>
                  <div className="flex flex-wrap gap-2">
                    {surahMatches.map((s: any) => (
                      <button key={s.number} onClick={() => setSelectedSurah(s)}
                        className="bg-white dark:bg-gray-700 hover:bg-emerald-100 dark:hover:bg-gray-600 border border-emerald-200 dark:border-emerald-600 text-emerald-800 dark:text-emerald-300 px-4 py-2 rounded-lg font-bold transition text-sm">
                        سورة {s.name.replace('سُورَةُ ', '')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.length === 0 && surahMatches.length === 0 ? (
                <div className="text-center bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                  <p className="text-gray-500 dark:text-gray-400 text-lg">لم يتم العثور على نتائج.</p>
                </div>
              ) : searchResults.length > 0 ? (
                <>
                  <p className="text-center text-gray-600 dark:text-gray-300 font-bold">
                    نتائج الآيات: {searchResults.length}
                  </p>
                  {searchResults.map((match: any, idx: number) => (
                    <div
                      key={idx}
                      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 rounded-xl shadow-sm hover:shadow-md transition"
                    >
                      <p className="quran-text text-2xl md:text-3xl leading-[2.5rem] md:leading-[3.5rem] text-gray-900 dark:text-gray-100 mb-3">
                        {match.text}
                      </p>
                      <div className="flex justify-between items-center border-t border-gray-100 dark:border-gray-700 pt-3">
                        <span className="text-sm bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300 px-3 py-1 rounded-full font-bold">
                          {match.surah.name} - الآية {match.numberInSurah}
                        </span>
                        <button
                          onClick={() => handleReadSurah(match.surah.number)}
                          className="text-sm bg-amber-100 hover:bg-amber-200 dark:bg-amber-900 dark:hover:bg-amber-800 text-amber-800 dark:text-amber-300 px-3 py-1 rounded-full font-bold transition"
                        >
                          📖 فتح سورة {match.surah.name}
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* عرض قائمة السور عند عدم وجود بحث نشط */}
      {!hasSearched && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {surahs.map((surah: any) => (
          <div key={surah.number} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 rounded-xl shadow-sm flex flex-col justify-between hover:shadow-md transition">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">سورة {surah.name.replace('سُورَةُ ', '')}</h2>
                <span className="text-sm bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
                  آياتها: {surah.numberOfAyahs}
                </span>
              </div>
            </div>

            <div>
              <button 
                onClick={() => setSelectedSurah(surah)}
                className="w-full mb-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold py-2 rounded-lg transition"
              >
                معلومات وقراءة السورة
              </button>

              <div>
                <audio
                  controls
                  preload="none"
                  className="w-full mt-2"
                  onPlay={(e) => {
                    const audios = document.getElementsByTagName('audio');
                    for (let i = 0; i < audios.length; i++) {
                      if (audios[i] !== e.target) audios[i].pause();
                    }
                  }}
                  src={`https://server11.mp3quran.net/yasser/${String(surah.number).padStart(3, '0')}.mp3`}
                >
                  متصفحك لا يدعم تشغيل الصوت.
                </audio>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* نافذة (Modal) بطاقة تعريف السورة عامة */}
      {selectedSurah && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSurah(null)}>
          <div 
            className="bg-white dark:bg-gray-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative animate-fadeInScale"
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setSelectedSurah(null)}
              className="absolute top-4 left-4 text-gray-400 hover:text-red-500 transition text-2xl"
            >
              ✕
            </button>
            
            <h3 className="text-3xl font-bold text-emerald-700 dark:text-emerald-400 mb-2">{selectedSurah.name}</h3>
            <div className="flex gap-2 mb-4 justify-center text-sm font-bold">
              <span className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 px-3 py-1 rounded-full">
                {selectedSurah.revelationType === 'Meccan' ? '🕋 مكية' : '🕌 مدنية'}
              </span>
              <span className="bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300 px-3 py-1 rounded-full">
                آياتها: {selectedSurah.numberOfAyahs}
              </span>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl text-gray-700 dark:text-gray-300 text-base leading-relaxed mb-6 border border-gray-100 dark:border-gray-700">
              <h4 className="font-bold text-emerald-700 dark:text-emerald-400 mb-2 border-b border-emerald-100 dark:border-emerald-800 pb-2">نبذة وسبب النزول:</h4>
              <p>{surahInfoData[selectedSurah.number] || 'جاري تحميل المعلومات...'}</p>
            </div>
            
            <button
              onClick={() => {
                handleReadSurah(selectedSurah.number);
                setSelectedSurah(null);
              }}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition"
            >
              📖 ابدأ القراءة
            </button>
          </div>
        </div>
      )}

    </main>
  );
}

