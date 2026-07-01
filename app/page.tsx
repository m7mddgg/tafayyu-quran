"use client";
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { seerahData } from './data/seerah';

const normalizeArabicText = (text: string) => {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة التشكيل
    .replace(/[أإآٱ]/g, 'ا') // توحيد الألف
    .replace(/ة/g, 'ه') // توحيد التاء المربوطة والهاء
    .replace(/ي/g, 'ى'); // توحيد الياء والألف المقصورة
};

// Levenshtein distance for fuzzy matching
const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({length: m + 1}, (_, i) =>
    Array.from({length: n + 1}, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
};

// مطابقة الكلمات مع سماح بخطأ حرف واحد للكلمات ذات 3 حروف أو أكثر
const wordsMatch = (spoken: string, expected: string): boolean => {
  if (spoken === expected) return true;
  if (spoken.length >= 3 && expected.length >= 2) {
    return levenshtein(spoken, expected) <= 1;
  }
  return false;
};

const RECITERS = [
  { id: 'yasser', name: 'ياسر الدوسري', url: 'https://server11.mp3quran.net/yasser' },
  { id: 'mishary', name: 'مشاري العفاسي', url: 'https://server8.mp3quran.net/afs' },
  { id: 'abdulbasit', name: 'عبد الباسط عبد الصمد', url: 'https://server7.mp3quran.net/basit' },
  { id: 'maher', name: 'ماهر المعيقلي', url: 'https://server12.mp3quran.net/maher' },
  { id: 'husary', name: 'محمود خليل الحصري', url: 'https://server13.mp3quran.net/husr' },
  { id: 'nuainy', name: 'أحمد نعينع', url: 'https://server11.mp3quran.net/ahmad_nu' },
];

const PrayerCountdown = ({ prayerTimes }: { prayerTimes: any }) => {
  const [nextPrayer, setNextPrayer] = useState<{ name: string; remaining: string } | null>(null);

  useEffect(() => {
    if (!prayerTimes) return;
    
    const calculate = () => {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const currentSeconds = now.getSeconds();
      
      const timings = [
        { name: 'الفجر', time: prayerTimes.timings.Fajr },
        { name: 'الشروق', time: prayerTimes.timings.Sunrise },
        { name: 'الظهر', time: prayerTimes.timings.Dhuhr },
        { name: 'العصر', time: prayerTimes.timings.Asr },
        { name: 'المغرب', time: prayerTimes.timings.Maghrib },
        { name: 'العشاء', time: prayerTimes.timings.Isha },
      ];

      let next = null;
      for (const p of timings) {
        const cleanTime = p.time.split(' ')[0];
        const [h, m] = cleanTime.split(':').map(Number);
        const pMinutes = h * 60 + m;
        if (pMinutes > currentMinutes || (pMinutes === currentMinutes && currentSeconds === 0)) {
          next = { ...p, pMinutes };
          break;
        }
      }

      if (!next) {
        const cleanTime = timings[0].time.split(' ')[0];
        const [h, m] = cleanTime.split(':').map(Number);
        next = { ...timings[0], pMinutes: h * 60 + m + 24 * 60 };
      }

      const diffSeconds = (next.pMinutes * 60) - (currentMinutes * 60 + currentSeconds);
      const hrs = Math.floor(diffSeconds / 3600);
      const mins = Math.floor((diffSeconds % 3600) / 60);
      const secs = diffSeconds % 60;

      const remainingStr = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      setNextPrayer({ name: next.name, remaining: remainingStr });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [prayerTimes]);

  if (!nextPrayer) return null;

  return (
    <div className="bg-gradient-to-l from-teal-600 to-emerald-500 text-white p-6 rounded-3xl shadow-xl mb-8 flex flex-col items-center justify-center transform transition hover:scale-[1.01]">
      <p className="text-xl md:text-2xl opacity-90 mb-2 font-semibold text-teal-50">متبقي على صلاة {nextPrayer.name}</p>
      <p className="text-5xl md:text-7xl font-bold font-mono tracking-widest dir-ltr drop-shadow-md">{nextPrayer.remaining}</p>
    </div>
  );
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
  const [selectedReciter, setSelectedReciter] = useState(RECITERS[0]);

  // Interactive Mode State
  const [isInteractiveMode, setIsInteractiveMode] = useState(false);
  const [interactiveReciter, setInteractiveReciter] = useState('ar.alafasy');
  const [interactiveAyahs, setInteractiveAyahs] = useState<any[]>([]);
  const [currentAyahIndex, setCurrentAyahIndex] = useState<number>(-1);
  const [isPlayingInteractive, setIsPlayingInteractive] = useState(false);
  const interactiveAudioRef = useRef<HTMLAudioElement | null>(null);

  const INTERACTIVE_RECITERS = [
    { id: 'ar.alafasy', name: 'مشاري العفاسي' },
    { id: 'ar.abdulbasitmurattal', name: 'عبد الباسط عبد الصمد' },
    { id: 'ar.minshawi', name: 'محمد صديق المنشاوي' },
    { id: 'ar.sudais', name: 'عبد الرحمن السديس' },
    { id: 'ar.husary', name: 'محمود خليل الحصري' }
  ];

  // Touch Swipe State
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  // Khatmah State
  const [khatmahGoal, setKhatmahGoal] = useState<number | null>(null);
  const [khatmahStartDate, setKhatmahStartDate] = useState<string | null>(null);
  const [readPages, setReadPages] = useState<number[]>([]);

  // Hifz State
  const [hifzGoal, setHifzGoal] = useState<number | null>(null);
  const [hifzStartDate, setHifzStartDate] = useState<string | null>(null);
  const [hifzPages, setHifzPages] = useState<number[]>([]);
  const [hifzSessionActive, setHifzSessionActive] = useState<boolean>(false);
  const [hifzCurrentPage, setHifzCurrentPage] = useState<number | null>(null);
  const [hifzWords, setHifzWords] = useState<any[]>([]);
  const [hifzExpectedWordIndex, setHifzExpectedWordIndex] = useState<number>(0);
  const [isHifzListening, setIsHifzListening] = useState<boolean>(false);
  const [hifzWrongWord, setHifzWrongWord] = useState<boolean>(false);
  const [isBlindMode, setIsBlindMode] = useState<boolean>(true);
  const [hifzCompletedSurahs, setHifzCompletedSurahs] = useState<number[]>([]);
  const [hifzNextSurah, setHifzNextSurah] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const isIntentionalStopRef = useRef<boolean>(false);
  const hifzWordsRef = useRef<any[]>([]);
  const hifzIdxRef = useRef<number>(0);
  const hifzCompletedSurahsRef = useRef<number[]>([]);
  const currentResultIndexRef = useRef<number>(0);
  const matchedInCurrentResultRef = useRef<number>(0);

  // Bookmarks State
  const [bookmarks, setBookmarks] = useState<any[]>([]);

  // Tasbeeh State
  const [tasbeehCount, setTasbeehCount] = useState<number>(0);
  const [tasbeehText, setTasbeehText] = useState<string>("سُبْحَانَ اللَّهِ");
  const tasbeehOptions = ["سُبْحَانَ اللَّهِ", "الْحَمْدُ لِلَّهِ", "لَا إِلَهَ إِلَّا اللَّهُ", "اللَّهُ أَكْبَرُ", "أَسْتَغْفِرُ اللَّهَ", "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ", "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ"];

  // Prayer Times State
  const [prayerTimes, setPrayerTimes] = useState<any | null>(null);
  const [prayerLocation, setPrayerLocation] = useState<string | null>(null);
  const [isLoadingPrayer, setIsLoadingPrayer] = useState(false);
  const [prayerError, setPrayerError] = useState<string | null>(null);

  // جلب قائمة السور والأذكار ومعرفة الصفحة المحفوظة والوضع الداكن والقارئ المفضل وتتبع الختمة والمفضلة عند فتح الموقع
  useEffect(() => {
    const savedReciter = localStorage.getItem('reciter_id');
    if (savedReciter) {
      const reciter = RECITERS.find(r => r.id === savedReciter);
      if (reciter) setSelectedReciter(reciter);
    }

    const savedKhatmahGoal = localStorage.getItem('khatmahGoal');
    const savedKhatmahStart = localStorage.getItem('khatmahStartDate');
    const savedReadPages = localStorage.getItem('readPages');
    const savedBookmarks = localStorage.getItem('quran_bookmarks');
    
    const savedHifzGoal = localStorage.getItem('hifzGoal');
    const savedHifzStart = localStorage.getItem('hifzStartDate');
    const savedHifzPages = localStorage.getItem('hifzPages');

    if (savedKhatmahGoal) setKhatmahGoal(Number(savedKhatmahGoal));
    if (savedKhatmahStart) setKhatmahStartDate(savedKhatmahStart);
    if (savedReadPages) setReadPages(JSON.parse(savedReadPages));
    if (savedBookmarks) setBookmarks(JSON.parse(savedBookmarks));

    if (savedHifzGoal) setHifzGoal(Number(savedHifzGoal));
    if (savedHifzStart) setHifzStartDate(savedHifzStart);
    if (savedHifzPages) setHifzPages(JSON.parse(savedHifzPages));

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

  // ضبط عنوان المتصفح بناء على الصفحة الحالية لتسهيل الحفظ
  useEffect(() => {
    let title = "تفيّؤ";
    if (currentPage !== null) {
      title = `تفيّؤ | المصحف - صفحة ${currentPage}`;
    } else if (activeSection === 'quran') {
      title = "تفيّؤ | المصحف الشريف";
    } else if (activeSection === 'adhkar') {
      title = "تفيّؤ | الأذكار والمأثورات";
    } else if (activeSection === 'fatawa') {
      title = "تفيّؤ | الفتاوى والأحكام";
    }
    document.title = title;
  }, [currentPage, activeSection]);

  // جلب الصوت التفاعلي عند تفعيل الوضع أو تغيير الصفحة
  useEffect(() => {
    if (isInteractiveMode && currentPage) {
      axios.get(`https://api.alquran.cloud/v1/page/${currentPage}/${interactiveReciter}`)
        .then(res => {
          setInteractiveAyahs(res.data.data.ayahs);
          if (isPlayingInteractive) {
            setCurrentAyahIndex(0); // Auto-start the new page
          } else {
            setCurrentAyahIndex(-1);
          }
        })
        .catch(err => console.error(err));
    } else {
      setInteractiveAyahs([]);
      setCurrentAyahIndex(-1);
      setIsPlayingInteractive(false);
    }
  }, [currentPage, interactiveReciter, isInteractiveMode]);

  useEffect(() => {
    if (interactiveAudioRef.current && isPlayingInteractive && currentAyahIndex >= 0 && interactiveAyahs[currentAyahIndex]) {
      // Pause main audio if playing
      const mainAudio = document.getElementById('main-quran-audio') as HTMLAudioElement;
      if (mainAudio && !mainAudio.paused) mainAudio.pause();

      interactiveAudioRef.current.play().catch(e => console.error("Audio play error", e));
      
      // Auto-scroll
      setTimeout(() => {
        const ayahElement = document.getElementById(`ayah-${interactiveAyahs[currentAyahIndex]?.number}`);
        if (ayahElement) {
          ayahElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [currentAyahIndex, isPlayingInteractive, interactiveAyahs]);

  const handleInteractivePlayPause = () => {
    if (isPlayingInteractive) {
      interactiveAudioRef.current?.pause();
      setIsPlayingInteractive(false);
    } else {
      if (currentAyahIndex === -1 && interactiveAyahs.length > 0) {
        setCurrentAyahIndex(0);
      }
      setIsPlayingInteractive(true);
    }
  };

  const handleInteractiveEnded = () => {
    if (currentAyahIndex < interactiveAyahs.length - 1) {
      setCurrentAyahIndex(prev => prev + 1);
    } else {
      // Auto flip page
      if (currentPage && currentPage < 604) {
        loadPage(currentPage + 1);
      } else {
        setIsPlayingInteractive(false);
      }
    }
  };

  // تحرير السورة المسموعة إذا تم تغيير الصفحة والصوت متوقف
  useEffect(() => {
    if (currentPage !== null) {
      const audioEl = document.getElementById('main-quran-audio') as HTMLAudioElement;
      if (!audioEl || audioEl.paused) {
        setPlayingAudioSurah(null);
      }
    }
  }, [currentPage]);

  // PWA Install Prompt logic
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const hasDismissed = localStorage.getItem('quran_install_dismissed');
      if (!hasDismissed) {
        setShowInstallPrompt(true);
      }
    };
    
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallPrompt(false);
    }
    setDeferredPrompt(null);
  };

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

  // دالة تغيير القارئ
  const handleReciterChange = (id: string) => {
    const reciter = RECITERS.find(r => r.id === id);
    if (reciter) {
      setSelectedReciter(reciter);
      localStorage.setItem('reciter_id', reciter.id);
    }
  };

  const startHifzPlan = (days: number) => {
    setHifzGoal(days);
    setHifzStartDate(new Date().toISOString());
    setHifzPages([]);
    localStorage.setItem('hifzGoal', String(days));
    localStorage.setItem('hifzStartDate', new Date().toISOString());
    localStorage.setItem('hifzPages', JSON.stringify([]));
  };

  const markHifzPageAsDone = (page: number) => {
    if (!hifzPages.includes(page)) {
      const newPages = [...hifzPages, page];
      setHifzPages(newPages);
      localStorage.setItem('hifzPages', JSON.stringify(newPages));
    }
  };

  const showHifzHint = () => {
    setHifzWords(prev => {
      const newWords = [...prev];
      const idx = hifzIdxRef.current;
      if (idx < newWords.length) {
        for (let i = 0; i < newWords.length; i++) {
          if (newWords[i].isWrong) newWords[i].isWrong = false;
        }
        newWords[idx].isHint = true;
        hifzWordsRef.current = newWords;
      }
      return newWords;
    });
    setHifzWrongWord(false);
    setTimeout(() => startHifzListening(), 300);
  };

  // تجميع الكلمات حسب السورة
  const getWordsBySurah = (words: any[]) => {
    const groups: { surahNum: number; surahName: string; words: any[]; startIdx: number }[] = [];
    words.forEach((w, i) => {
      const sNum = w.surah?.number;
      const sName = w.surah?.name || '';
      const last = groups[groups.length - 1];
      if (!last || last.surahNum !== sNum) {
        groups.push({ surahNum: sNum, surahName: sName, words: [w], startIdx: i });
      } else {
        last.words.push(w);
      }
    });
    return groups;
  };

  const renderHifzSection = () => {
    if (hifzSessionActive && hifzCurrentPage) {
      const surahGroups = getWordsBySurah(hifzWords);
      const isDone = hifzExpectedWordIndex >= hifzWords.length && hifzWords.length > 0;

      return (
        <div className="bg-white dark:bg-gray-800 p-4 md:p-8 rounded-3xl shadow-lg border border-emerald-100 dark:border-gray-700 mx-auto max-w-4xl relative">
          <button onClick={handleOpenHifz} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 font-bold">
             العودة
          </button>
          
          <h2 className="text-2xl font-bold text-center text-emerald-700 dark:text-emerald-400 mb-6 mt-4">جلسة الحفظ: صفحة {hifzCurrentPage}</h2>
          
          {!isDone && (
            <div className="flex justify-center gap-4 mb-6">
               <button 
                  onClick={isHifzListening ? () => stopHifzListening() : startHifzListening}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full text-white font-bold transition-all shadow-md ${isHifzListening ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-emerald-600 hover:bg-emerald-700'}`}
               >
                  <span className="text-xl">{isHifzListening ? '⏹️' : '🎙️'}</span>
                  {isHifzListening ? 'إيقاف التسميع' : 'ابدأ التسميع'}
               </button>
               <button 
                  onClick={() => setIsBlindMode(!isBlindMode)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all shadow-md ${isBlindMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'}`}
               >
                  <span className="text-xl">{isBlindMode ? '🙈' : '👁️'}</span>
                  {isBlindMode ? 'الوضع الأعمى مفعل' : 'الوضع العادي'}
               </button>
            </div>
          )}

          {/* عرض الكلمات مجمعة حسب السورة */}
          <div className="space-y-6">
            {surahGroups.map((group) => {
              const surahDone = hifzCompletedSurahs.includes(group.surahNum);
              return (
                <div key={group.surahNum}>
                  {/* اسم السورة */}
                  <div className={`flex items-center justify-center gap-3 mb-3 py-2 px-4 rounded-xl ${
                    surahDone
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700'
                      : 'bg-amber-50 dark:bg-gray-700/50 border border-amber-200 dark:border-gray-600'
                  }`}>
                    {surahDone && <span className="text-emerald-600 text-2xl">✅</span>}
                    <span className={`font-bold text-lg font-quran ${
                      surahDone ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-300'
                    }`}>
                      {surahDone ? 'أحسنت! ' : ''}سورة {group.surahName}
                    </span>
                  </div>

                  {/* كلمات السورة */}
                  <div className="quran-block bg-emerald-50/50 dark:bg-gray-900/50 p-5 rounded-2xl border border-dashed border-emerald-200 dark:border-emerald-800/50 text-center">
                    {group.words.map((wordObj, i) => (
                      <span key={i} className={`inline-block mx-1 font-quran text-2xl md:text-3xl leading-loose transition-all duration-300 ${
                        wordObj.match
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : wordObj.isHint
                            ? 'text-amber-500 dark:text-amber-300'
                            : wordObj.isWrong
                              ? 'text-red-500 dark:text-red-400 animate-pulse'
                              : isBlindMode 
                                ? 'text-transparent bg-gray-200 dark:bg-gray-700 rounded-lg select-none'
                                : 'text-gray-900 dark:text-gray-100'
                      }`}>
                        {wordObj.original}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* إعلان السورة التالية */}
          {hifzNextSurah && !isDone && (
            <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-700 text-center">
              <p className="text-indigo-700 dark:text-indigo-300 font-bold text-xl mb-1">✨ أحسنت! الآن دور <span className="font-quran">{hifzNextSurah}</span></p>
              <p className="text-indigo-500 dark:text-indigo-400">يلا سمع بسم الله 🙏</p>
            </div>
          )}

          {/* رسالة الخطأ */}
          {hifzWrongWord && !isDone && (
             <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 rounded-xl border border-red-200 dark:border-red-700 text-center">
               <p className="text-red-700 dark:text-red-300 font-bold mb-3">⚠️ توقفت عند هذه الكلمة، قلها مرة أخرى</p>
               <div className="flex justify-center gap-3">
                 <button onClick={() => {
                   setHifzWrongWord(false);
                   setHifzWords(prev => { const n = [...prev]; if(hifzIdxRef.current < n.length) n[hifzIdxRef.current].isWrong = false; hifzWordsRef.current = n; return n; });
                   startHifzListening();
                 }} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold transition">
                   🎙️ حاول مجدداً
                 </button>
                 <button onClick={showHifzHint} className="px-5 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-full font-bold transition border border-amber-300">
                   💡 تلميح
                 </button>
               </div>
             </div>
          )}
          
          {isDone && (
             <div className="mt-8 text-center">
                <div className="text-3xl font-bold text-emerald-600 mb-2">🎉 ما شاء الله! أتممت تسميع الصفحة كاملةً.</div>
                <p className="text-gray-500 dark:text-gray-400 mb-6">بارك الله فيك وزادك علماً وحفظاً ✨</p>
                <button 
                   onClick={() => {
                     markHifzPageAsDone(hifzCurrentPage);
                     handleOpenHifz();
                   }}
                   className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold shadow-lg transition-transform hover:scale-105"
                >
                   اعتماد الحفظ والعودة
                </button>
             </div>
          )}
        </div>
      );
    }
    
    // UI if no goal set
    if (!hifzGoal || !hifzStartDate) {
      return (
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm p-6 rounded-3xl shadow-sm border border-emerald-100 dark:border-gray-700 text-center mb-10 mx-auto max-w-3xl">
          <div className="text-6xl mb-4">🧠</div>
          <h2 className="text-3xl font-bold text-emerald-700 dark:text-emerald-400 mb-4">خطط لحفظ القرآن</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">حدد المدة التي ترغب فيها بإتمام حفظ القرآن الكريم، وسنقوم بتنظيم الورد اليومي لك واختبارك بالصوت.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => startHifzPlan(365 * 3)} className="px-6 py-3 bg-emerald-50 dark:bg-gray-700 hover:bg-emerald-100 dark:hover:bg-gray-600 text-emerald-800 dark:text-emerald-300 rounded-xl font-bold border border-emerald-200 dark:border-gray-600">3 سنوات</button>
            <button onClick={() => startHifzPlan(365 * 2)} className="px-6 py-3 bg-emerald-50 dark:bg-gray-700 hover:bg-emerald-100 dark:hover:bg-gray-600 text-emerald-800 dark:text-emerald-300 rounded-xl font-bold border border-emerald-200 dark:border-gray-600">سنتان</button>
            <button onClick={() => startHifzPlan(365)} className="px-6 py-3 bg-emerald-50 dark:bg-gray-700 hover:bg-emerald-100 dark:hover:bg-gray-600 text-emerald-800 dark:text-emerald-300 rounded-xl font-bold border border-emerald-200 dark:border-gray-600">سنة واحدة</button>
            <button onClick={() => startHifzPlan(30)} className="px-6 py-3 bg-emerald-50 dark:bg-gray-700 hover:bg-emerald-100 dark:hover:bg-gray-600 text-emerald-800 dark:text-emerald-300 rounded-xl font-bold border border-emerald-200 dark:border-gray-600">مراجعة مكثفة (شهر)</button>
          </div>
        </div>
      );
    }

    // Tracker UI
    const pagesPerDay = Math.ceil(604 / hifzGoal);
    const start = new Date(hifzStartDate);
    const now = new Date();
    const daysElapsed = Math.floor((now.getTime() - start.getTime()) / (1000 * 3600 * 24));
    const targetPages = Math.min((daysElapsed + 1) * pagesPerDay, 604);
    const progressPercent = Math.min((hifzPages.length / 604) * 100, 100);
    const isBehind = hifzPages.length < targetPages;
    const nextPageToMemorize = hifzPages.length > 0 ? Math.max(...hifzPages) + 1 : 1;

    return (
      <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md p-6 rounded-3xl shadow-lg border-2 border-emerald-100 dark:border-gray-700 mb-10 mx-auto max-w-4xl relative overflow-hidden">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-emerald-800 dark:text-emerald-400">متابعة الحفظ</h2>
          <button onClick={() => {
            if(confirm('هل أنت متأكد أنك تريد إعادة ضبط خطة الحفظ الخاصة بك؟')) {
              setHifzGoal(null);
              setHifzStartDate(null);
              setHifzPages([]);
              localStorage.removeItem('hifzGoal');
              localStorage.removeItem('hifzStartDate');
              localStorage.removeItem('hifzPages');
            }
          }} className="text-sm text-red-500 hover:text-red-700 hover:underline">إعادة ضبط</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-emerald-50 dark:bg-gray-700 p-4 rounded-2xl border border-emerald-100 dark:border-gray-600 text-center">
            <span className="block text-gray-500 dark:text-gray-400 text-sm mb-1">هدف الحفظ</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-300 text-xl">{hifzGoal} يوم</span>
          </div>
          <div className="bg-emerald-50 dark:bg-gray-700 p-4 rounded-2xl border border-emerald-100 dark:border-gray-600 text-center">
            <span className="block text-gray-500 dark:text-gray-400 text-sm mb-1">الورد اليومي</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-300 text-xl">{pagesPerDay} صفحة</span>
          </div>
          <div className="bg-emerald-50 dark:bg-gray-700 p-4 rounded-2xl border border-emerald-100 dark:border-gray-600 text-center">
            <span className="block text-gray-500 dark:text-gray-400 text-sm mb-1">ما تم حفظه</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-300 text-xl">{hifzPages.length} صفحة</span>
          </div>
          <div className={`p-4 rounded-2xl border text-center ${isBehind ? 'bg-red-50 border-red-100 dark:bg-red-900/30 dark:border-red-800/50' : 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/30 dark:border-emerald-800/50'}`}>
            <span className="block text-gray-500 dark:text-gray-400 text-sm mb-1">الحالة</span>
            <span className={`font-bold text-xl ${isBehind ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {isBehind ? `متأخر (${targetPages - hifzPages.length} ص)` : 'ممتاز، مستمر!'}
            </span>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-between text-sm mb-2 font-bold text-gray-700 dark:text-gray-300">
            <span>نسبة الحفظ الكلية</span>
            <span>{progressPercent.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden shadow-inner">
            <div className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-4 transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>
        
        <div className="text-center mt-8">
           <button 
             onClick={() => startHifzSession(nextPageToMemorize > 604 ? 604 : nextPageToMemorize)}
             className="px-10 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold text-xl shadow-lg transition-transform hover:scale-105 flex items-center justify-center gap-3 mx-auto w-full md:w-auto"
           >
              <span>ابدأ تسميع ورد اليوم</span>
              <span className="bg-white/20 px-3 py-1 rounded-full text-sm">صفحة {nextPageToMemorize > 604 ? 604 : nextPageToMemorize}</span>
           </button>
        </div>
      </div>
    );
  };

  // واجهة متتبع الختمة
  const renderKhatmahTracker = () => {
    if (!khatmahGoal || !khatmahStartDate) {
      return (
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm p-6 rounded-3xl shadow-sm border border-emerald-100 dark:border-gray-700 text-center mb-10 mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mb-2">متتبع الختمة 📖</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-5">حدد هدفك لختم القرآن الكريم وسنساعدك في متابعة وردك اليومي</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => startKhatmah(30)} className="px-5 py-2.5 bg-emerald-50 dark:bg-gray-700 hover:bg-emerald-100 dark:hover:bg-gray-600 text-emerald-800 dark:text-emerald-300 rounded-xl font-bold border border-emerald-200 dark:border-gray-600 transition">30 يوماً</button>
            <button onClick={() => startKhatmah(15)} className="px-5 py-2.5 bg-emerald-50 dark:bg-gray-700 hover:bg-emerald-100 dark:hover:bg-gray-600 text-emerald-800 dark:text-emerald-300 rounded-xl font-bold border border-emerald-200 dark:border-gray-600 transition">15 يوماً</button>
            <button onClick={() => startKhatmah(7)} className="px-5 py-2.5 bg-emerald-50 dark:bg-gray-700 hover:bg-emerald-100 dark:hover:bg-gray-600 text-emerald-800 dark:text-emerald-300 rounded-xl font-bold border border-emerald-200 dark:border-gray-600 transition">7 أيام</button>
          </div>
        </div>
      );
    }

    const pagesPerDay = Math.ceil(604 / khatmahGoal);
    const start = new Date(khatmahStartDate);
    const now = new Date();
    const daysElapsed = Math.floor((now.getTime() - start.getTime()) / (1000 * 3600 * 24));
    const targetPages = Math.min((daysElapsed + 1) * pagesPerDay, 604);
    const progressPercent = Math.min((readPages.length / 604) * 100, 100);
    const isBehind = readPages.length < targetPages;

    return (
      <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm p-6 rounded-3xl shadow-sm border border-emerald-200 dark:border-emerald-800 text-center mb-10 mx-auto max-w-3xl">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold text-emerald-700 dark:text-emerald-400">متابعة الختمة</h2>
          <button onClick={() => {
            if(confirm('هل أنت متأكد أنك تريد إلغاء الختمة الحالية والبدء من جديد؟')) {
              setKhatmahGoal(null);
              setKhatmahStartDate(null);
              setReadPages([]);
              localStorage.removeItem('khatmahGoal');
              localStorage.removeItem('khatmahStartDate');
              localStorage.removeItem('readPages');
            }
          }} className="text-xs text-red-500 hover:text-red-700 hover:underline">إلغاء الختمة</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 text-sm">
          <div className="bg-emerald-50 dark:bg-gray-700 p-3 rounded-2xl border border-emerald-100 dark:border-gray-600">
            <span className="block text-gray-500 dark:text-gray-400 mb-1">الهدف</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">{khatmahGoal} يوماً</span>
          </div>
          <div className="bg-emerald-50 dark:bg-gray-700 p-3 rounded-2xl border border-emerald-100 dark:border-gray-600">
            <span className="block text-gray-500 dark:text-gray-400 mb-1">الورد اليومي</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">{pagesPerDay} صفحة</span>
          </div>
          <div className="bg-emerald-50 dark:bg-gray-700 p-3 rounded-2xl border border-emerald-100 dark:border-gray-600">
            <span className="block text-gray-500 dark:text-gray-400 mb-1">ما قرأته</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">{readPages.length} صفحة</span>
          </div>
          <div className={`p-3 rounded-2xl border ${isBehind ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800'}`}>
            <span className="block text-gray-500 dark:text-gray-400 mb-1">الحالة</span>
            <span className={`font-bold ${isBehind ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {isBehind ? `متأخر بـ ${targetPages - readPages.length} صفحة` : 'أنت على المسار الصحيح'}
            </span>
          </div>
        </div>
        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3 mb-2 overflow-hidden border border-gray-200 dark:border-gray-600">
          <div className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-3 rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }}></div>
        </div>
        <span className="text-xs text-gray-500 font-bold">{progressPercent.toFixed(1)}% اكتمل</span>
      </div>
    );
  };

  // دوال الختمة
  const startKhatmah = (days: number) => {
    setKhatmahGoal(days);
    setKhatmahStartDate(new Date().toISOString());
    setReadPages([]);
    localStorage.setItem('khatmahGoal', String(days));
    localStorage.setItem('khatmahStartDate', new Date().toISOString());
    localStorage.setItem('readPages', JSON.stringify([]));
  };

  const markPageAsRead = (page: number) => {
    if (!readPages.includes(page)) {
      const updated = [...readPages, page];
      setReadPages(updated);
      localStorage.setItem('readPages', JSON.stringify(updated));
    }
  };

  const removePageFromRead = (page: number) => {
    const updated = readPages.filter(p => p !== page);
    setReadPages(updated);
    localStorage.setItem('readPages', JSON.stringify(updated));
  };

  // دوال المفضلة
  const toggleBookmark = (item: any, type: 'ayah' | 'fatwa') => {
    let updated = [...bookmarks];
    const existsIndex = updated.findIndex(b => b.type === type && (type === 'ayah' ? b.data.number === item.number : b.data.title === item.title));
    
    if (existsIndex >= 0) {
      updated.splice(existsIndex, 1);
    } else {
      updated.push({ type, data: item });
    }
    setBookmarks(updated);
    localStorage.setItem('quran_bookmarks', JSON.stringify(updated));
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

  // دوال التقليب باللمس (Swipe)
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    // في العربية (من اليمين لليسار)، السحب لليسار يعني الصفحة التالية، والسحب لليمين يعني الصفحة السابقة
    if (isLeftSwipe) {
      nextPage();
    }
    if (isRightSwipe) {
      prevPage();
    }
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
  const goToLanding = () => {
    setActiveSection(null);
    setCurrentPage(null);
    setPageInput('');
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setSelectedAdhkarCategory(null);
    setAdhkarCounts({});
    setPlayingAudioSurah(null);
    setSelectedFatawaCategory(null);
    setHifzSessionActive(false);
  };

  const handleOpenHifz = () => {
    setActiveSection('hifz');
    setCurrentPage(null);
    setHifzSessionActive(false);
    stopHifzListening();
  };

  const normalizeArabicText = (text: string) => {
    if (!text) return '';
    return text
      .replace(/[\u064B-\u065F\u0670\u0651\u0654\u0655\u06DF\u06E2\u06E3\u06E5\u06E6\u06E8\u06EA-\u06ED\u06D6-\u06DC]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ـ/g, '')
      .replace(/[^\u0600-\u06FF\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const stopHifzListening = (intentional = true) => {
    if (intentional) isIntentionalStopRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }
    if (intentional) setIsHifzListening(false);
  };

  const startHifzListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('عذراً، متصفحك لا يدعم التعرف على الصوت. جرب متصفح Google Chrome.');
      return;
    }

    const audioEl = document.getElementById('main-quran-audio') as HTMLAudioElement;
    if (audioEl && !audioEl.paused) audioEl.pause();

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(e) {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;    // يستمر الاستماع دون توقف
    recognition.interimResults = true; // يعرض النتائج فورياً
    recognition.lang = 'ar-SA';
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setIsHifzListening(true);
      setHifzWrongWord(false);
      setHifzNextSurah(null);
      currentResultIndexRef.current = 0;
      matchedInCurrentResultRef.current = 0;
    };

    recognition.onend = () => {
      // إذا انتهى ولم يكن متعمداً ولا خطأ → أعد تشغيله
      if (!isIntentionalStopRef.current) {
        const idx = hifzIdxRef.current;
        const words = hifzWordsRef.current;
        if (idx < words.length) {
          try { 
            recognition.start(); 
          } catch(e) {
            // يفشل إعادة التشغيل التلقائي غالباً في متصفحات الموبايل (iOS)
            setIsHifzListening(false);
          }
        } else {
          setIsHifzListening(false);
        }
      } else {
        setIsHifzListening(false);
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error === 'not-allowed') {
        alert('يرجى السماح باستخدام الميكروفون من إعدادات المتصفح.');
        isIntentionalStopRef.current = true;
        setIsHifzListening(false);
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error('Speech Rec Error:', e.error);
        setIsHifzListening(false);
      }
    };

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue;

        const currentWords = hifzWordsRef.current;
        let currentIdx = hifzIdxRef.current;

        if (currentIdx >= currentWords.length) break;

        // ===== اختيار أفضل بديل (البديل اللي بيطابق أكتر كلمات) =====
        let bestWords: string[] = [];
        let bestMatchCount = -1;

        for (let j = 0; j < event.results[i].length; j++) {
          const words = normalizeArabicText(event.results[i][j].transcript)
            .split(' ').filter((w: string) => w.length > 0);

          // نعد كم كلمة متتالية تطابق (بمطابقة مرنة) من الموضع الحالي
          let count = 0;
          for (const w of words) {
            const idx = currentIdx + count;
            if (idx >= currentWords.length) break;
            if (wordsMatch(w, currentWords[idx].normalized)) count++;
            else break;
          }

          if (count > bestMatchCount) {
            bestMatchCount = count;
            bestWords = words;
          }
        }

        // ===== نشتغل على أفضل بديل بس =====
        let stopped = false;
        for (const spokenWord of bestWords) {
          if (currentIdx >= currentWords.length) break;

          if (wordsMatch(spokenWord, currentWords[currentIdx].normalized)) {
            // صح! أخضر وتقدم
            const idx = currentIdx;
            setHifzWords(prev => {
              const newWords = [...prev];
              newWords[idx].match = true;
              newWords[idx].isWrong = false;
              newWords[idx].isHint = false;
              hifzWordsRef.current = newWords;
              return newWords;
            });

            const nextIdx = currentIdx + 1;
            currentIdx = nextIdx;
            hifzIdxRef.current = nextIdx;
            setHifzExpectedWordIndex(nextIdx);

            const prevSurahNum = currentWords[idx].surah?.number;
            const isPageDone = nextIdx >= currentWords.length;
            const surahChanged = !isPageDone && currentWords[nextIdx].surah?.number !== prevSurahNum;

            if ((isPageDone || surahChanged) && !hifzCompletedSurahsRef.current.includes(prevSurahNum)) {
              hifzCompletedSurahsRef.current = [...hifzCompletedSurahsRef.current, prevSurahNum];
              setHifzCompletedSurahs([...hifzCompletedSurahsRef.current]);
              if (surahChanged) {
                const nextSurahName = currentWords[nextIdx].surah?.name || '';
                setHifzNextSurah(nextSurahName);
                setTimeout(() => setHifzNextSurah(null), 3000);
              }
            }

          } else {
            // غلط! أحمر وأوقف
            const idx = currentIdx;
            setHifzWords(prev => {
              const newWords = [...prev];
              newWords[idx].isWrong = true;
              hifzWordsRef.current = newWords;
              return newWords;
            });
            setHifzWrongWord(true);
            isIntentionalStopRef.current = true;
            try { recognition.stop(); } catch(e) {}
            setIsHifzListening(false);
            stopped = true;
            break;
          }
        }
        if (stopped) break;
      }
    };


    recognitionRef.current = recognition;
    isIntentionalStopRef.current = false;
    try {
      recognition.start();
    } catch (e) {
      console.log('Already started');
    }
  };


  const startHifzSession = async (pageNumber: number) => {
    setIsLoadingPage(true);
    try {
      const [uthmaniRes, cleanRes] = await Promise.all([
        axios.get(`https://api.alquran.cloud/v1/page/${pageNumber}/quran-uthmani`),
        axios.get(`https://api.alquran.cloud/v1/page/${pageNumber}/quran-simple-clean`)
      ]);
      
      const uthmaniAyahs = uthmaniRes.data.data.ayahs;
      const cleanAyahs = cleanRes.data.data.ayahs;
      const wordsArray: any[] = [];
      
      for (let i = 0; i < uthmaniAyahs.length; i++) {
        const uAyah = uthmaniAyahs[i];
        const cAyah = cleanAyahs[i];
        
        let uText = uAyah.text;
        let cText = cAyah.text.replace(/\uFEFF/g, ''); // إزالة العلامات المخفية
        
        // إزالة البسملة باستخدام تطبيع الكلمات لتجنب مشاكل التشكيل
        if (uAyah.numberInSurah === 1 && uAyah.surah.number !== 1 && uAyah.surah.number !== 9) {
           const cParts = cText.trim().split(/\s+/);
           if (cParts.length >= 4) {
             const first4Norm = cParts.slice(0, 4).map(normalizeArabicText).join(' ');
             if (first4Norm === 'بسم الله الرحمن الرحيم') {
               cText = cParts.slice(4).join(' ');
               const uParts = uText.trim().split(/\s+/);
               // نحذف أول 4 كلمات من العثماني (نفس عدد كلمات البسملة)
               uText = uParts.slice(4).join(' ');
             }
           }
        }
        
        const uWords = uText.split(' ').filter((w: string) => w.trim() !== '');
        const cWords = cText.split(' ').filter((w: string) => w.trim() !== '');
        
        for (let j = 0; j < uWords.length; j++) {
           const norm = normalizeArabicText(cWords[j] || uWords[j]);
           // نتجاهل الرموز الوقفية التي ليس لها نطق (إذا كان الكلمة المطبّعة فارغة)
           if (norm.length > 0) {
             wordsArray.push({
               original: uWords[j],
               normalized: norm,
               ayahNumber: uAyah.number,
               ayahNumberInSurah: uAyah.numberInSurah,
               surah: uAyah.surah,
               match: false,
               isHint: false
             });
           }
        }
      }
      
      setHifzWords(wordsArray);
      hifzWordsRef.current = wordsArray;
      setHifzExpectedWordIndex(0);
      hifzIdxRef.current = 0;
      setHifzWrongWord(false);
      setHifzCompletedSurahs([]);
      hifzCompletedSurahsRef.current = [];
      setHifzNextSurah(null);
      setHifzCurrentPage(pageNumber);
      setHifzSessionActive(true);
      setIsLoadingPage(false);
    } catch (error) {
      console.error(error);
      setIsLoadingPage(false);
    }
  };

  // دالة جلب مواقيت الصلاة
  const fetchPrayerTimes = () => {
    setActiveSection('prayer');
    if (prayerTimes) return; // تم الجلب مسبقاً
    
    setIsLoadingPrayer(true);
    setPrayerError(null);

    if (!navigator.geolocation) {
      setPrayerError("متصفحك لا يدعم تحديد الموقع الجغرافي.");
      setIsLoadingPrayer(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        axios.get(`https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=5`)
          .then(res => {
            setPrayerTimes(res.data.data);
            setPrayerLocation("موقعك الحالي");
            setIsLoadingPrayer(false);
          })
          .catch(() => {
            setPrayerError("حدث خطأ أثناء جلب مواقيت الصلاة.");
            setIsLoadingPrayer(false);
          });
      },
      () => {
        setPrayerError("لم نتمكن من تحديد موقعك. يرجى السماح بصلاحية الموقع الجغرافي.");
        setIsLoadingPrayer(false);
      }
    );
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
  if (activeSection === 'bookmarks') {
    return (
      <main className={`p-6 md:p-8 min-h-screen text-right bg-gradient-to-b from-yellow-50 to-white dark:from-gray-900 dark:to-gray-800 dark:text-gray-100 ${theme === 'dark' ? 'dark' : ''} ${theme === 'sepia' ? 'theme-sepia' : ''}`} dir="rtl">
        <div className="max-w-4xl mx-auto">
          {/* شريط التحكم */}
          <div className="flex flex-wrap justify-between items-center mb-8 gap-3 bg-white/50 dark:bg-gray-800/50 p-4 rounded-2xl backdrop-blur-sm border border-yellow-100 dark:border-yellow-900">
            <button onClick={goToLanding} className="bg-yellow-100 dark:bg-yellow-900 hover:bg-yellow-200 dark:hover:bg-yellow-800 text-yellow-800 dark:text-yellow-200 px-5 py-2.5 rounded-xl font-bold transition flex items-center gap-2">
              <span>🏠</span> العودة للرئيسية
            </button>
            <h1 className="text-3xl md:text-4xl font-bold text-yellow-700 dark:text-yellow-400">مفضلاتي ⭐</h1>
            <button onClick={cycleTheme} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-xl font-bold transition">
              {theme === 'dark' ? '💡 نهار' : theme === 'sepia' ? '🌙 داكن' : '📜 كلاسيك'}
            </button>
          </div>

          {bookmarks.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">⭐</div>
              <h2 className="text-2xl font-bold text-gray-500 dark:text-gray-400">لا توجد عناصر في المفضلة بعد.</h2>
            </div>
          ) : (
            <div className="space-y-6">
              {bookmarks.map((b, idx) => (
                <div key={idx} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-yellow-100 dark:border-yellow-900">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-sm font-bold text-white bg-yellow-500 px-3 py-1 rounded-full">
                      {b.type === 'ayah' ? 'آية قرآنية' : 'فتوى'}
                    </span>
                    <button onClick={() => toggleBookmark(b.data, b.type)} className="text-2xl text-yellow-500 hover:text-yellow-600 transition">★</button>
                  </div>
                  {b.type === 'ayah' ? (
                    <div>
                      <p className="text-2xl font-bold font-quran text-gray-800 dark:text-gray-100 mb-4 leading-loose">{b.data.text} ﴿{b.data.numberInSurah}﴾</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">سورة {b.data.surah?.name}</p>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-3">{b.data.question}</h3>
                      <p className="text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">{b.data.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  // --------------------------------------------------------
  if (activeSection === 'prayer') {
    return (
      <main className={`p-6 md:p-8 min-h-screen text-right bg-gradient-to-b from-indigo-50 to-white dark:from-gray-900 dark:to-gray-800 dark:text-gray-100 ${theme === 'dark' ? 'dark' : ''} ${theme === 'sepia' ? 'theme-sepia' : ''}`} dir="rtl">
        <div className="max-w-4xl mx-auto">
          {/* شريط التحكم */}
          <div className="flex flex-wrap justify-between items-center mb-8 gap-3 bg-white/50 dark:bg-gray-800/50 p-4 rounded-2xl backdrop-blur-sm border border-indigo-100 dark:border-indigo-900">
            <button onClick={goToLanding} className="bg-indigo-100 dark:bg-indigo-900 hover:bg-indigo-200 dark:hover:bg-indigo-800 text-indigo-800 dark:text-indigo-200 px-5 py-2.5 rounded-xl font-bold transition flex items-center gap-2">
              <span>🏠</span> العودة للرئيسية
            </button>
            <h1 className="text-3xl md:text-4xl font-bold text-indigo-700 dark:text-indigo-400">مواقيت الصلاة</h1>
            <button onClick={cycleTheme} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-xl font-bold transition">
              {theme === 'dark' ? '💡 نهار' : theme === 'sepia' ? '🌙 داكن' : '📜 كلاسيك'}
            </button>
          </div>

          {isLoadingPrayer && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-4"></div>
              <p className="text-xl text-indigo-700 dark:text-indigo-400 font-bold">جاري تحديد موقعك وجلب المواقيت...</p>
            </div>
          )}

          {prayerError && (
            <div className="bg-red-50 dark:bg-red-900/30 p-8 rounded-3xl text-center border border-red-200 dark:border-red-800">
              <div className="text-5xl mb-4">📍</div>
              <h2 className="text-2xl font-bold text-red-700 dark:text-red-400 mb-3">{prayerError}</h2>
              <button onClick={fetchPrayerTimes} className="mt-4 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition shadow-md">
                إعادة المحاولة
              </button>
            </div>
          )}

          {prayerTimes && !isLoadingPrayer && !prayerError && (
            <div className="space-y-6">
              
              <PrayerCountdown prayerTimes={prayerTimes} />

              <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-indigo-100 dark:border-indigo-900 text-center">
                <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">{prayerTimes.date.hijri.weekday.ar}</h3>
                <p className="text-lg text-indigo-600 dark:text-indigo-400 font-semibold mb-1">
                  {prayerTimes.date.hijri.day} {prayerTimes.date.hijri.month.ar} {prayerTimes.date.hijri.year} هـ
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  الموافق: {prayerTimes.date.readable}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { name: 'الفجر', time: prayerTimes.timings.Fajr, icon: '🌅' },
                  { name: 'الشروق', time: prayerTimes.timings.Sunrise, icon: '🌄' },
                  { name: 'الظهر', time: prayerTimes.timings.Dhuhr, icon: '☀️' },
                  { name: 'العصر', time: prayerTimes.timings.Asr, icon: '🌤️' },
                  { name: 'المغرب', time: prayerTimes.timings.Maghrib, icon: '🌇' },
                  { name: 'العشاء', time: prayerTimes.timings.Isha, icon: '🌙' },
                ].map((prayer, idx) => (
                  <div key={idx} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-indigo-50 dark:border-gray-700 text-center flex flex-col items-center justify-center transform hover:scale-105 transition-transform">
                    <div className="text-4xl mb-3">{prayer.icon}</div>
                    <h4 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-2">{prayer.name}</h4>
                    <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400 dir-ltr">{prayer.time}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

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

            {/* شريط الصوت */}
            {(activeAudioSurah || isInteractiveMode) && (
              <div className="bg-amber-50 dark:bg-amber-900/20 p-3 md:p-4 rounded-t-3xl border-b border-amber-200 dark:border-amber-700/50 transition-all duration-500 max-h-40 overflow-hidden">
                <div className="flex flex-col md:flex-row items-center gap-3">
                  
                  {!isInteractiveMode ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">🎧 القارئ:</span>
                        <select
                          value={selectedReciter.id}
                          onChange={(e) => handleReciterChange(e.target.value)}
                          className="bg-white dark:bg-gray-700 border border-amber-300 dark:border-amber-600 rounded p-1 text-sm outline-none text-amber-900 dark:text-amber-100"
                        >
                          {RECITERS.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 w-full flex items-center justify-between gap-4">
                        <audio
                          id="main-quran-audio"
                          controls
                          key={`${selectedReciter.id}-${activeAudioSurah}`}
                          preload="auto"
                          className="w-full"
                          onPlay={(e) => {
                            const audios = document.getElementsByTagName('audio');
                            for (let i = 0; i < audios.length; i++) {
                              if (audios[i] !== e.target) audios[i].pause();
                            }
                          }}
                          onEnded={() => {
                            if (activeAudioSurah && activeAudioSurah < 114) {
                              setPlayingAudioSurah(activeAudioSurah + 1);
                              setTimeout(() => {
                                const audioEl = document.getElementById('main-quran-audio') as HTMLAudioElement;
                                if (audioEl) audioEl.play();
                              }, 100);
                            }
                          }}
                          src={`${selectedReciter.url}/${String(activeAudioSurah).padStart(3, '0')}.mp3`}
                        >
                          متصفحك لا يدعم تشغيل الصوت.
                        </audio>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* الوضع التفاعلي (آية بآية) */}
                      <div className="flex flex-wrap items-center justify-between w-full gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">القارئ:</span>
                          <select
                            value={interactiveReciter}
                            onChange={(e) => {
                              setInteractiveReciter(e.target.value);
                              if (isPlayingInteractive) handleInteractivePlayPause();
                            }}
                            className="bg-white dark:bg-gray-700 border border-emerald-300 dark:border-emerald-600 rounded p-1 text-sm outline-none text-emerald-900 dark:text-emerald-100"
                          >
                            {INTERACTIVE_RECITERS.map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={handleInteractivePlayPause}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white w-12 h-12 rounded-full flex items-center justify-center font-bold shadow-md transition text-xl"
                          >
                            {isPlayingInteractive ? '⏸️' : '▶️'}
                          </button>
                          
                          <div className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                            {currentAyahIndex >= 0 ? `الآية ${interactiveAyahs[currentAyahIndex]?.numberInSurah}` : 'جاهز للتشغيل'}
                          </div>
                        </div>

                        <audio
                          ref={interactiveAudioRef}
                          src={interactiveAyahs[currentAyahIndex]?.audio || ''}
                          onEnded={handleInteractiveEnded}
                          onPause={() => setIsPlayingInteractive(false)}
                          onPlay={() => setIsPlayingInteractive(true)}
                          className="hidden"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* أزرار الختمة */}
            <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-600 flex justify-center">
                {readPages.includes(currentPage) ? (
                  <button onClick={() => removePageFromRead(currentPage)} className="px-4 py-2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 rounded-lg text-sm font-bold flex items-center gap-2 transition hover:bg-emerald-200">
                    <span>✅</span> تمت قراءة هذه الصفحة
                  </button>
                ) : (
                  <button onClick={() => markPageAsRead(currentPage)} className="px-4 py-2 bg-white dark:bg-gray-700 border border-emerald-300 dark:border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                    إتمام قراءة الصفحة في الختمة
                  </button>
                )}
            </div>
          </div>

          {/* حالة التحميل */}
          {isLoadingPage && (
            <div className="flex items-center justify-center min-h-[60vh]">
              <p className="text-2xl text-emerald-600 dark:text-emerald-400 font-bold animate-pulse">جاري تحميل الصفحة...</p>
            </div>
          )}
          
          {/* ورقة المصحف */}
          {!isLoadingPage && (
          <div 
            key={flipKey} 
            className="page-flip-enter quran-frame classic-frame bg-white dark:bg-gray-800"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <div className="quran-block">
              {pageAyahs.map((ayah, index) => (
                <span 
                  key={index} 
                  id={`ayah-${ayah.number}`}
                  className={`inline group relative transition-colors duration-300 ${
                    isInteractiveMode && currentAyahIndex === index 
                      ? 'bg-emerald-100/80 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200 rounded-lg outline outline-2 outline-emerald-300/50 mx-0.5' 
                      : ''
                  }`}
                >
                  {/* أزرار الآية المخفية تظهر عند التمرير */}
                  <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10 pointer-events-none group-hover:pointer-events-auto">
                    <button onClick={() => toggleBookmark(ayah, 'ayah')} className="text-yellow-500 hover:scale-110 p-1">
                      {bookmarks.some(b => b.type === 'ayah' && b.data.number === ayah.number) ? '★' : '☆'}
                    </button>
                  </div>

                  {/* علامة البسملة للسور */}
                  {ayah.numberInSurah === 1 && (
                    <div className="block text-center my-6">
                      <div className="surah-header-classic relative inline-block px-12 py-3 border-y-2 border-emerald-200 dark:border-emerald-700/50">
                        <span className="text-xl md:text-2xl font-bold text-emerald-800 dark:text-emerald-400">
                          سورة {ayah.surah.name.replace('سُورَةُ ', '')}
                        </span>
                      </div>
                    </div>
                  )}
                  {/* استثناء الفاتحة والتوبة من البسملة */}
                  {ayah.numberInSurah === 1 && ayah.surah.number !== 1 && ayah.surah.number !== 9 && (
                    <div className="block text-center text-xl md:text-2xl font-bold mb-6 text-emerald-700 dark:text-emerald-500 font-quran">
                      بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                    </div>
                  )}
                  
                  <span className="quran-text font-quran text-2xl md:text-3xl leading-loose text-gray-900 dark:text-gray-100 cursor-pointer transition hover:text-emerald-700 dark:hover:text-emerald-400"
                        onClick={() => {
                          setExpandedTafsir(prev => ({...prev, [ayah.number]: !prev[ayah.number]}));
                        }}>
                    {ayah.text.replace('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', '').trim()} 
                    <span className="ayah-number mx-1 text-emerald-600 dark:text-emerald-400 select-none">
                      ﴿{ayah.numberInSurah}﴾
                    </span>
                  </span>

                  {/* بطاقة التفسير */}
                  {expandedTafsir[ayah.number] && ayah.tafsir && (
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

          {/* أزرار التقليب (السابق والتالي) والوضع التفاعلي */}
          <div className="flex flex-col md:flex-row justify-between items-center mt-8 gap-4">
            <button
              onClick={prevPage}
              disabled={currentPage === 1}
              className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold transition disabled:opacity-50 shadow-md"
            >
              ➡️ الصفحة السابقة
            </button>
            
            <button
              onClick={() => {
                setIsInteractiveMode(!isInteractiveMode);
                if (playingAudioSurah) setPlayingAudioSurah(null);
              }}
              className={`w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition shadow-md border-2 ${isInteractiveMode ? 'bg-emerald-100 border-emerald-400 text-emerald-900 dark:bg-emerald-900/50 dark:border-emerald-600 dark:text-emerald-200' : 'bg-white border-emerald-200 text-emerald-800 dark:bg-gray-800 dark:border-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-gray-700'}`}
            >
              <span className="text-xl">{isInteractiveMode ? '✨' : '📖'}</span>
              {isInteractiveMode ? 'القراءة التفاعلية (مفعلة)' : 'القارئ التفاعلي (آية بآية)'}
            </button>

            <button
              onClick={nextPage}
              disabled={currentPage === 604}
              className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold transition disabled:opacity-50 shadow-md"
            >
              الصفحة التالية ⬅️
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 mt-6">
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
          <h1 className="text-5xl md:text-7xl font-bold text-emerald-700 dark:text-emerald-400 mb-2 leading-tight font-quran">تَفَيُّؤ</h1>
          <p className="text-base md:text-lg text-emerald-600/70 dark:text-emerald-500/70 mb-1 font-quran">﷽</p>
          <p className="text-lg md:text-xl text-gray-500 dark:text-gray-400 mb-4">تطبيقك الإسلامي الشامل</p>
          <button onClick={cycleTheme} className="mb-10 inline-flex items-center gap-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-700 dark:text-gray-300 px-5 py-2.5 rounded-full text-sm font-bold shadow-sm border border-gray-200 dark:border-gray-700 transition hover:shadow-md">
            {theme === 'dark' ? '🌙 الوضع الداكن' : theme === 'sepia' ? '📜 الوضع الكلاسيكي' : '☀️ الوضع الفاتح'}
          </button>

          {/* PWA Install Prompt */}
          {showInstallPrompt && (
            <div className="mb-10 p-5 bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in mx-4 md:mx-0">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-600 text-white w-12 h-12 rounded-xl flex items-center justify-center font-bold text-2xl shadow-md">
                  ✨
                </div>
                <div className="text-right">
                  <h3 className="font-bold text-emerald-800 dark:text-emerald-200 text-lg">ثبّت التطبيق على جهازك</h3>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">للوصول السريع للمصحف والأذكار في أي وقت وبدون إنترنت</p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <button 
                  onClick={handleInstallClick} 
                  className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold transition shadow-md"
                >
                  تثبيت الآن
                </button>
                <button 
                  onClick={() => {
                    setShowInstallPrompt(false);
                    localStorage.setItem('quran_install_dismissed', 'true');
                  }} 
                  className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition font-bold"
                >
                  لاحقاً
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* كارت القرآن الكريم */}
            <button
              onClick={() => setActiveSection('quran')}
              className="group bg-white dark:bg-gray-800 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:scale-[1.03] transition-all duration-300 text-center cursor-pointer"
            >
              <div className="bg-emerald-100 dark:bg-emerald-900/50 w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-4xl text-emerald-600 dark:text-emerald-400">📖</span>
                </div>
              <h2 className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mb-2">القرآن الكريم</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">تلاوة، تفسير، واستماع</p>
            </button>
            
            {/* كارت التحفيظ */}
            <button 
              onClick={handleOpenHifz}
              className="group bg-white dark:bg-gray-800 border-2 border-indigo-200 dark:border-indigo-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:scale-[1.03] transition-all duration-300 text-center cursor-pointer"
            >
              <div className="bg-indigo-100 dark:bg-indigo-900/50 w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="text-4xl text-indigo-600 dark:text-indigo-400">🎙️</span>
              </div>
              <h2 className="text-xl font-bold text-indigo-700 dark:text-indigo-400 mb-2">التحفيظ</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">تسميع صوتي تفاعلي</p>
            </button>

            {/* كارت الأذكار والأدعية */}
            <button
              onClick={() => setActiveSection('adhkar')}
              className="group bg-white dark:bg-gray-800 border-2 border-amber-200 dark:border-amber-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:scale-[1.03] transition-all duration-300 text-center cursor-pointer"
            >
              <div className="bg-amber-100 dark:bg-amber-900/50 w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-4xl text-amber-600 dark:text-amber-400">📿</span>
                </div>
              <h2 className="text-xl font-bold text-amber-700 dark:text-amber-400 mb-2">الأذكار</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">حصن المسلم وعداد التسبيح</p>
            </button>

            {/* كارت الأحكام والفتاوى */}
            <button
              onClick={() => setActiveSection('fatawa')}
              className="group bg-white dark:bg-gray-800 border-2 border-sky-200 dark:border-sky-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:scale-[1.03] transition-all duration-300 text-center cursor-pointer"
            >
              <div className="bg-sky-100 dark:bg-sky-900/50 w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-4xl text-sky-600 dark:text-sky-400">⚖️</span>
                </div>
              <h2 className="text-xl font-bold text-sky-700 dark:text-sky-400 mb-2">الفتاوى</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">أحكام دينية ومسائل يومية</p>
            </button>
            
            {/* كارت السيرة النبوية */}
            <button
              onClick={() => setActiveSection('seerah')}
              className="group bg-white dark:bg-gray-800 border-2 border-rose-200 dark:border-rose-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:scale-[1.03] transition-all duration-300 text-center cursor-pointer"
            >
              <div className="bg-rose-100 dark:bg-rose-900/50 w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-4xl text-rose-600 dark:text-rose-400">🕌</span>
                </div>
              <h2 className="text-xl font-bold text-rose-700 dark:text-rose-400 mb-2">السيرة النبوية</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">حياة ومسيرة النبي ﷺ</p>
            </button>

            {/* كارت مواقيت الصلاة */}
            <button
              onClick={fetchPrayerTimes}
              className="group bg-white dark:bg-gray-800 border-2 border-teal-200 dark:border-teal-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:scale-[1.03] transition-all duration-300 text-center cursor-pointer"
            >
              <div className="bg-teal-100 dark:bg-teal-900/50 w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-4xl text-teal-600 dark:text-teal-400">🕋</span>
                </div>
              <h2 className="text-xl font-bold text-teal-700 dark:text-teal-400 mb-2">مواقيت الصلاة</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">مواقيت دقيقة حسب موقعك</p>
            </button>

            {/* كارت السبحة الإلكترونية */}
            <button
              onClick={() => setActiveSection('tasbeeh')}
              className="group bg-white dark:bg-gray-800 border-2 border-fuchsia-200 dark:border-fuchsia-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:scale-[1.03] transition-all duration-300 text-center cursor-pointer"
            >
              <div className="bg-fuchsia-100 dark:bg-fuchsia-900/50 w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-4xl text-fuchsia-600 dark:text-fuchsia-400">👆</span>
                </div>
              <h2 className="text-xl font-bold text-fuchsia-700 dark:text-fuchsia-400 mb-2">السبحة الإلكترونية</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">عداد ذكي مع تفاعل واهتزاز</p>
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
  // Hifz Section
  // --------------------------------------------------------
  if (activeSection === 'hifz') {
      return (
        <main className={`p-6 md:p-8 min-h-screen text-right bg-gradient-to-br from-indigo-50 to-white dark:from-gray-900 dark:to-gray-800 dark:text-gray-100 ${theme === 'dark' ? 'dark' : ''} ${theme === 'sepia' ? 'theme-sepia' : ''}`} dir="rtl">
           <div className="max-w-7xl mx-auto mb-12">
              <div className="flex justify-between items-center mb-6">
                  <button onClick={goToLanding} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-bold transition">🏠 الرئيسية</button>
                  <h1 className="text-3xl font-bold text-indigo-700 dark:text-indigo-400">🎙️ التحفيظ التفاعلي</h1>
                  <button onClick={cycleTheme} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-bold transition">{theme === 'dark' ? '🌙' : '☀️'}</button>
              </div>
              {renderHifzSection()}
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
  // قسم السبحة الإلكترونية
  // --------------------------------------------------------
  if (activeSection === 'tasbeeh') {
    const handleTasbeehClick = () => {
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      setTasbeehCount(prev => prev + 1);
    };

    const handleReset = () => {
      if (window.confirm("هل أنت متأكد من تصفير العداد؟")) {
        setTasbeehCount(0);
      }
    };

    return (
      <main className={`p-6 md:p-8 min-h-screen flex flex-col bg-gradient-to-br from-fuchsia-50 to-white dark:from-gray-900 dark:to-gray-800 dark:text-gray-100 ${theme === 'dark' ? 'dark' : ''} ${theme === 'sepia' ? 'theme-sepia' : ''}`} dir="rtl">
        <div className="max-w-2xl mx-auto w-full flex-grow flex flex-col">
          {/* شريط التحكم */}
          <div className="flex flex-wrap justify-between items-center mb-12 gap-3 bg-white/50 dark:bg-gray-800/50 p-4 rounded-2xl backdrop-blur-sm border border-fuchsia-100 dark:border-fuchsia-900">
            <button onClick={goToLanding} className="bg-fuchsia-100 dark:bg-fuchsia-900 hover:bg-fuchsia-200 dark:hover:bg-fuchsia-800 text-fuchsia-800 dark:text-fuchsia-200 px-5 py-2.5 rounded-xl font-bold transition flex items-center gap-2">
              <span>🏠</span> العودة للرئيسية
            </button>
            <h1 className="text-3xl md:text-4xl font-bold text-fuchsia-700 dark:text-fuchsia-400">السبحة الإلكترونية</h1>
            <button onClick={cycleTheme} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-xl font-bold transition">
              {theme === 'dark' ? '💡' : theme === 'sepia' ? '🌙' : '📜'}
            </button>
          </div>

          <div className="flex-grow flex flex-col items-center justify-center pb-20">
            {/* اختيار الذكر */}
            <div className="mb-12 w-full relative group">
              <select 
                value={tasbeehText}
                onChange={(e) => { setTasbeehText(e.target.value); setTasbeehCount(0); }}
                className="appearance-none w-full bg-white dark:bg-gray-800 border-2 border-fuchsia-200 dark:border-fuchsia-800 text-fuchsia-800 dark:text-fuchsia-300 text-3xl md:text-5xl leading-relaxed font-bold font-quran text-center p-6 rounded-3xl shadow-sm focus:outline-none focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100 dark:focus:ring-fuchsia-900/50 transition cursor-pointer"
              >
                {tasbeehOptions.map((opt, i) => (
                  <option key={i} value={opt}>{opt}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 left-6 flex items-center px-2 text-fuchsia-400 group-hover:text-fuchsia-600 transition">
                <svg className="fill-current h-8 w-8" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>

            {/* العداد والزرار */}
            <div className="relative w-72 h-72 md:w-96 md:h-96 mx-auto mt-4">
              {/* زر التصفير */}
              <button 
                onClick={handleReset}
                className="absolute top-2 right-2 bg-white dark:bg-gray-700 border border-red-200 dark:border-red-900/50 hover:bg-red-500 hover:text-white hover:border-red-500 text-red-500 dark:text-red-400 w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl transition-all shadow-lg z-10 hover:rotate-180"
                title="تصفير العداد"
              >
                🔄
              </button>
              
              {/* الدائرة الرئيسية للسبحة */}
              <button
                onClick={handleTasbeehClick}
                className="w-full h-full bg-gradient-to-br from-fuchsia-500 to-purple-600 active:scale-95 active:shadow-inner hover:shadow-2xl transition-all duration-75 rounded-[40%] shadow-xl flex flex-col items-center justify-center text-white select-none border-[12px] border-fuchsia-100 dark:border-gray-800 cursor-pointer"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <span className="text-8xl md:text-[10rem] font-bold font-mono tracking-widest drop-shadow-md mb-4">{tasbeehCount}</span>
                <span className="text-2xl font-bold opacity-90 uppercase tracking-widest bg-black/15 px-8 py-3 rounded-full">اضغط للتسبيح</span>
              </button>
            </div>
          </div>
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
  // قسم السيرة النبوية العطرة
  // --------------------------------------------------------
  if (activeSection === 'seerah') {
    return (
      <main className={`p-6 md:p-8 min-h-screen text-right bg-gradient-to-b from-rose-50 to-white dark:from-gray-900 dark:to-gray-800 dark:text-gray-100 ${theme === 'dark' ? 'dark' : ''} ${theme === 'sepia' ? 'theme-sepia' : ''}`}  dir="rtl">
        <div className="max-w-5xl mx-auto">
          {/* شريط التحكم */}
          <div className="flex flex-wrap justify-between items-center mb-10 gap-3">
            <button onClick={goToLanding} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-bold transition">
              🏠 الرئيسية
            </button>
            <h1 className="text-3xl md:text-5xl font-bold text-rose-700 dark:text-rose-400 font-quran text-center leading-normal">
              السيرة النبوية العطرة <br/> <span className="text-xl md:text-2xl text-rose-600/70 dark:text-rose-500/70">عليه أفضل الصلاة والسلام</span>
            </h1>
            <button onClick={cycleTheme} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-bold transition">
              {theme === 'dark' ? '🌙' : theme === 'sepia' ? '📜' : '☀️'}
            </button>
          </div>

          <div className="space-y-12 pb-20 relative">

            {seerahData.map((stage, index) => (
              <div key={stage.id} className="relative z-10">
                
                <div className="flex flex-col lg:flex-row items-center justify-center mb-6">
                   <div className="bg-rose-600 dark:bg-rose-700 text-white w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-lg border-4 border-white dark:border-gray-800 z-20 mb-4 lg:mb-0">
                     {stage.icon}
                   </div>
                   <h2 className="text-2xl md:text-3xl font-bold text-rose-800 dark:text-rose-300 lg:mx-6 bg-rose-100 dark:bg-rose-900/40 px-6 py-2 rounded-full shadow-sm">
                     {stage.title}
                   </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {stage.items.map((item, idx) => (
                    <div key={idx} className="bg-white dark:bg-gray-800 border border-rose-100 dark:border-rose-900/50 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                      <h3 className="text-xl font-bold text-rose-700 dark:text-rose-400 mb-4 pb-2 border-b border-rose-100 dark:border-gray-700">
                        {item.subtitle}
                      </h3>
                      <p className="text-gray-700 dark:text-gray-300 leading-8 text-lg font-sans">
                        {item.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

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
        <div className="max-w-5xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-emerald-100 dark:border-gray-700">
          
          <div className="bg-emerald-600 text-white p-4 text-center font-bold text-xl md:text-2xl flex items-center justify-center gap-4">
            <span>📖 فهرس سور القرآن الكريم</span>
            <span className="text-sm bg-emerald-700 px-3 py-1 rounded-full">{surahs.length} سورة</span>
          </div>
          
          {/* Global Reciter Selection */}
          <div className="bg-emerald-50 dark:bg-gray-900 p-4 flex justify-between items-center border-b border-emerald-100 dark:border-gray-700">
            <span className="font-bold text-emerald-800 dark:text-emerald-400">القراءة بصوت:</span>
            <select
              value={selectedReciter.id}
              onChange={(e) => handleReciterChange(e.target.value)}
              className="bg-white dark:bg-gray-800 border border-emerald-200 dark:border-gray-600 rounded-lg p-2 text-sm outline-none text-gray-700 dark:text-gray-300 font-bold shadow-sm"
            >
              {RECITERS.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="divide-y divide-emerald-50 dark:divide-gray-700 max-h-[80vh] overflow-y-auto custom-scrollbar">
            {surahs.map((surah: any) => (
              <div key={surah.number} className="flex flex-col md:flex-row items-center p-4 hover:bg-emerald-50/50 dark:hover:bg-gray-700/50 transition duration-200 group">
                
                {/* Surah Info */}
                <div 
                  className="flex-1 w-full flex items-center gap-4 mb-4 md:mb-0 cursor-pointer" 
                  onClick={() => setSelectedSurah(surah)}
                >
                  <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-emerald-100 dark:bg-gray-700 text-emerald-700 dark:text-emerald-400 font-bold rounded-full border border-emerald-200 dark:border-gray-600 group-hover:scale-105 group-hover:bg-emerald-200 dark:group-hover:bg-gray-600 transition-all">
                    {surah.number}
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      سورة {surah.name.replace('سُورَةُ ', '')}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">
                      {surah.revelationType === 'Meccan' ? 'مكية' : 'مدنية'} • {surah.numberOfAyahs} آية
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="w-full md:w-auto flex flex-col sm:flex-row items-center gap-4">
                  <button 
                    onClick={() => setSelectedSurah(surah)}
                    className="w-full sm:w-auto px-6 py-2.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-emerald-800 dark:text-emerald-300 font-bold rounded-full transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <span>📖</span> قراءة
                  </button>
                  <div className="w-full sm:w-64 bg-gray-50 dark:bg-gray-900 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700">
                    <audio
                      controls
                      preload="none"
                      className="w-full h-11"
                      onPlay={(e) => {
                        const audios = document.getElementsByTagName('audio');
                        for (let i = 0; i < audios.length; i++) {
                          if (audios[i] !== e.target) audios[i].pause();
                        }
                      }}
                      src={`${selectedReciter.url}/${String(surah.number).padStart(3, '0')}.mp3`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
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
