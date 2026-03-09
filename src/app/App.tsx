import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import svgPaths from "../imports/svg-y2albhotsg";
type TestState = 'ready' | 'active' | 'finished';
type Stats = { wpm: number; cpm: number; accuracy: number; correct: number; incorrect: number };

export default function App() {
  const [wordList, setWordList] = useState<string[]>([]);
  const [testState, setTestState] = useState<TestState>('ready');
  const [text, setText] = useState('');
  const [input, setInput] = useState('');
  const [currentWord, setCurrentWord] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [lineHeight, setLineHeight] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [lastStats, setLastStats] = useState<Stats | null>(null);
  type FlashType = 'better' | 'worse' | 'same' | null;
  type FlashMap = { wpm: FlashType; cpm: FlashType; accuracy: FlashType; correct: FlashType; incorrect: FlashType };
  const [flashMap, setFlashMap] = useState<FlashMap>({ wpm: null, cpm: null, accuracy: null, correct: null, incorrect: null });
  const inputRef = useRef<HTMLInputElement>(null);
  const restartButtonRef = useRef<HTMLButtonElement>(null);
  const textContainerRef = useRef<HTMLParagraphElement>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [totalErrors, setTotalErrors] = useState(0);

  type Language = { id: string; file: string; name?: string; code?: string };
  const [languages, setLanguages] = useState<Language[]>([]);
  const [currentLang, setCurrentLang] = useState<string>('english');
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const langPickerRef = useRef<HTMLDivElement>(null);

  // Fetch languages and initial words
  useEffect(() => {
    fetch('/words/languages.json')
      .then(res => res.json())
      .then(data => {
        setLanguages(data);
      })
      .catch(err => console.error("Failed to load languages:", err));
  }, []);

  // Fetch words when currentLang changes
  useEffect(() => {
    const langFile = languages.find(l => l.id === currentLang)?.file || 'english.json';
    fetch(`/words/${langFile}`)
      .then(res => res.json())
      .then(data => {
        setWordList(data.words);
      })
      .catch(err => console.error(`Failed to load ${currentLang} words:`, err));
  }, [currentLang, languages]);

  // Close lang picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langPickerRef.current && !langPickerRef.current.contains(event.target as Node)) {
        setLangPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update text whenever wordList loads for the first time or changes
  useEffect(() => {
    if (wordList.length > 0) {
      resetTest();
    }
  }, [wordList]);

  // Reset test
  const resetTest = () => {
    if (wordList.length === 0) return;

    // Generate a sequence of 120 random words
    let randomWords = [];
    for (let i = 0; i < 120; i++) {
      randomWords.push(wordList[Math.floor(Math.random() * wordList.length)]);
    }
    setText(randomWords.join(' '));
    setInput('');
    setCurrentWord('');
    setTimeLeft(60);
    setTestState('ready');
    setStartTime(null);
    setTotalErrors(0);
    inputRef.current?.focus();
  };

  // Timer
  useEffect(() => {
    if (testState === 'active' && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setTestState('finished');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [testState, timeLeft]);

  // Save stats when test finishes
  useEffect(() => {
    if (testState === 'finished') {
      const newStats = calculateStats();
      const compare = (next: number, prev: number | undefined, lowerIsBetter = false): FlashType => {
        if (prev === undefined) return 'better';
        if (next === prev) return 'same';
        const improved = lowerIsBetter ? next < prev : next > prev;
        return improved ? 'better' : 'worse';
      };
      const prev = lastStats ?? undefined;
      setFlashMap({
        wpm: compare(newStats.wpm, prev?.wpm),
        cpm: compare(newStats.cpm, prev?.cpm),
        accuracy: compare(newStats.accuracy, prev?.accuracy),
        correct: compare(newStats.correct, prev?.correct),
        incorrect: compare(newStats.incorrect, prev?.incorrect, true),
      });
      setLastStats(newStats);
      const t = setTimeout(() => setFlashMap({ wpm: null, cpm: null, accuracy: null, correct: null, incorrect: null }), 900);
      return () => clearTimeout(t);
    }
  }, [testState]);

  // Handle input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    if (testState === 'ready') {
      setTestState('active');
      setStartTime(Date.now());
    }

    if (testState === 'finished') return;

    // Determine what changed
    const isBackspace = value.length < currentWord.length;

    if (value.endsWith(' ')) {
      // User typed a space
      const remainingText = text.slice(input.length);
      const nextSpaceIndex = remainingText.indexOf(' ');
      const expectedLength = nextSpaceIndex !== -1 ? nextSpaceIndex + 1 : remainingText.length;

      let finalizedWord = value;
      // Pad with \0 (invisible, incorrect character) if space pressed early
      if (expectedLength > 0 && value.length < expectedLength) {
        finalizedWord = value.slice(0, -1) + '\0'.repeat(expectedLength - value.length) + ' ';
      } else if (expectedLength > 0 && value.length > expectedLength) {
        // Truncate extra characters if space pressed late
        finalizedWord = value.slice(0, expectedLength - 1) + ' ';
      }

      setInput(prev => prev + finalizedWord);
      // Clear the local input field
      setCurrentWord('');
    } else if (isBackspace && currentWord === '' && input.endsWith(' ')) {
      // Allow backspacing into the previous word if the current word is empty
      const lastSpaceIndex = input.lastIndexOf(' ', input.length - 2);
      const prevWordBlock = input.slice(lastSpaceIndex + 1);
      const prevInput = input.slice(0, lastSpaceIndex + 1);

      // Extract the actual typing the user did, removing any \0 and the single trailing space we padded
      const actualTyped = prevWordBlock.replace(/[\0 ]+$/, '');

      setInput(prevInput);
      setCurrentWord(actualTyped);
    } else {
      const prevLength = currentWord.length;
      const newLength = value.length;

      // Если добавили символ (не backspace)
      if (newLength > prevLength) {
        const typedChar = value[newLength - 1];
        const expectedChar = text[input.length + newLength - 1];

        if (typedChar !== expectedChar) {
          setTotalErrors(prev => prev + 1);
        }
      }

      setCurrentWord(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      restartButtonRef.current?.focus();
    }
  };

  // Calculate stats
  const calculateStats = () => {
    const fullInput = input + currentWord;

    const chars = fullInput.split('');
    const textChars = text.split('');

    let correct = 0;
    let incorrect = 0;

    chars.forEach((char, i) => {
      if (i >= textChars.length) {
        incorrect++;
      } else if (char === textChars[i]) {
        correct++;
      } else {
        incorrect++;
      }
    });

    const elapsedMinutes = startTime
      ? (Date.now() - startTime) / 60000
      : 1;

    const words = fullInput.length / 5;

    const wpm = Math.round(words / elapsedMinutes);
    const cpm = Math.round(correct / elapsedMinutes);

    const totalTyped = correct + totalErrors;

    const accuracy =
      totalTyped > 0
        ? Math.round((correct / totalTyped) * 100)
        : 100;

    return { wpm, cpm, accuracy, correct, incorrect };
  };

  const stats = calculateStats();

  // Render text with colors
  const renderText = () => {
    const chars = text.split('');
    const fullInput = input + currentWord;
    const inputChars = fullInput.split('');

    // When finished, find end of the incomplete word (from cursor to next space)
    const incompleteWordEnd = testState === 'finished'
      ? (() => {
        const nextSpace = text.indexOf(' ', fullInput.length);
        return nextSpace === -1 ? text.length : nextSpace;
      })()
      : -1;

    return chars.map((char, i) => {
      let color = 'white';
      let opacity = 1;

      if (i < inputChars.length) {
        color = inputChars[i] === char ? '#3aff4a' : '#ff3a3d';
        opacity = 1;
      } else if (testState === 'finished' && i < incompleteWordEnd) {
        // Remaining chars of the unfinished word → grey
        color = '#888888';
        opacity = 1;
      }

      return (
        <span
          key={i}
          ref={(el) => { charRefs.current[i] = el; }}
          style={{ color, opacity }}
        >
          {char}
        </span>
      );
    });
  };

  // Update cursor position and scroll offset
  useLayoutEffect(() => {
    const fullInputLength = input.length + currentWord.length;
    const targetIndex = Math.min(fullInputLength, text.length - 1);
    const targetEl = charRefs.current[targetIndex];
    const containerEl = textContainerRef.current;

    if (targetEl && containerEl) {
      const elTop = targetEl.offsetTop;
      const elLeft = targetEl.offsetLeft;
      const elWidth = targetEl.offsetWidth;
      const elHeight = targetEl.offsetHeight;

      // Detect line height from first character
      const firstEl = charRefs.current[0];
      const lh = firstEl ? firstEl.offsetHeight : elHeight;
      setLineHeight(lh);

      // Current row (0-indexed)
      const currentRow = Math.round(elTop / lh);

      // Keep cursor on row index 1 (second line) once past row 0
      const targetRow = Math.max(0, currentRow - 1);
      setScrollOffset(targetRow * lh);

      setCursorPos({
        top: elTop,
        left: elLeft,
        width: elWidth,
        height: elHeight,
      });
    }
  }, [input, currentWord, text]);

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="bg-[#1c2027] relative size-full min-h-screen flex flex-col" style={{ zoom: 0.9 }}>
      {/* Header */}
      <div className="w-full max-w-[1920px] mx-auto px-[317px] py-[40px] relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[10px]">
            <div className="size-[40px]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 40 40">
                <g>
                  <path d={svgPaths.p3a9cf700} fill="white" />
                  <path d={svgPaths.p2501f000} fill="#1C2027" />
                  <path d={svgPaths.p2501f000} fill="#1C2027" />
                </g>
              </svg>
            </div>
            <p className="leading-[normal] not-italic text-[32px] text-white whitespace-nowrap">typero</p>
          </div>

          <div className="flex items-center gap-[16px]">
            <button className="size-[30px]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 33 33">
                <path d={svgPaths.p1e127780} stroke="white" strokeLinecap="round" strokeWidth="3" />
              </svg>
            </button>
            <button className="size-[33px]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 33 33">
                <path clipRule="evenodd" d={svgPaths.pe5f0800} fill="white" fillRule="evenodd" />
              </svg>
            </button>

            <div className="relative" ref={langPickerRef}>
              <button
                onClick={() => setLangPickerOpen(!langPickerOpen)}
                className="bg-[rgba(255,255,255,0.05)] h-[46px] rounded-[5px] min-w-[115px] flex items-center justify-center gap-[8px] px-[24px] hover:bg-[rgba(255,255,255,0.1)] transition-colors"
              >
                <p className="leading-[normal] not-italic text-[20px] text-white uppercase">
                  {languages.find(l => l.id === currentLang)?.code || currentLang.slice(0, 2)}
                </p>
                <svg className={`w-[13px] h-[8px] transition-transform ${langPickerOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 13 8">
                  <path d={svgPaths.p57c8a00} fill="white" />
                </svg>
              </button>

              {langPickerOpen && (
                <div className="absolute top-[56px] right-0 bg-[#2a2f38] rounded-[5px] p-[8px] flex flex-col gap-[4px] z-50 min-w-full shadow-xl">
                  {languages.map(lang => (
                    <button
                      key={lang.id}
                      onClick={() => {
                        setCurrentLang(lang.id);
                        setLangPickerOpen(false);
                      }}
                      className={`px-[16px] py-[8px] rounded-[3px] text-white text-left text-[16px] transition-colors ${currentLang === lang.id ? 'bg-white/20' : 'hover:bg-white/10'}`}
                    >
                      {lang.id.charAt(0).toUpperCase() + lang.id.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-[1920px] mx-auto px-[317px] flex-1 flex flex-col items-center justify-center gap-[15px]">
        {/* Text Display */}
        <div
          className="w-full max-w-[1070px] bg-[rgba(255,255,255,0.05)] rounded-[10px] p-[39px_53.5px] relative overflow-hidden"
          style={{ height: lineHeight > 0 ? `${lineHeight * 3 + 78}px` : '228px' }}
        >
          <div
            style={{
              transform: `translateY(-${scrollOffset}px)`,
              transition: 'transform 0.2s ease-out',
            }}
          >
            <p ref={textContainerRef} className="text-[30px] leading-[1.5] relative">
              {renderText()}
              {testState !== 'finished' && (
                <div
                  className="absolute bg-[#d9d9d9]/30 rounded-[2px] pointer-events-none transition-all duration-150 ease-out animate-pulse"
                  style={{
                    top: cursorPos.top,
                    left: cursorPos.left,
                    width: cursorPos.width || 14,
                    height: cursorPos.height || 36,
                  }}
                />
              )}
            </p>
          </div>
        </div>

        {/* Input Area and Timer */}
        <div className="w-full max-w-[1070px] flex gap-[15px]">
          <div className="flex-1 bg-[rgba(255,255,255,0.05)] rounded-[10px] h-[70px] px-[26.75px] flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={currentWord}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={testState === 'finished'}
              className="w-full bg-transparent outline-none text-[24px] text-white placeholder:text-white/50"
              placeholder={testState === 'ready' ? 'Start typing...' : ''}
            />
          </div>

          <button
            ref={restartButtonRef}
            onClick={resetTest}
            className="bg-[rgba(255,255,255,0.05)] rounded-[10px] w-[197.95px] h-[70px] flex items-center justify-center gap-[16px] hover:bg-[rgba(255,255,255,0.1)] transition-colors focus:ring-2 focus:ring-white/20 focus:outline-none"
          >
            <p className="text-[32px] text-white">
              {formatTime(timeLeft)}
            </p>
            <div className="size-[31.032px]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 31.0322 31.0322">
                <path d={svgPaths.p1b182600} fill="white" />
              </svg>
            </div>
          </button>
        </div>

        {/* Results */}
        <div className="w-full max-w-[1070px] flex items-center justify-between mt-[90px] text-center">
          {/* WPM */}
          <div className="flex flex-col items-center gap-[15px] relative w-[20%]">
            <p className="text-[24px] text-[rgba(255,255,255,0.5)]">WPM</p>
            <p key={lastStats?.wpm} className={`text-[32px] text-white ${flashMap.wpm ? `stat-flash-${flashMap.wpm}` : ''}`}>{lastStats ? lastStats.wpm : '—'}</p>
            <div className="absolute right-0 top-[5px] h-[77px] w-[1px]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1 77">
                <line opacity="0.1" stroke="white" x1="0.5" y1="0" x2="0.5" y2="77" />
              </svg>
            </div>
          </div>

          {/* CPM */}
          <div className="flex flex-col items-center gap-[15px] relative w-[20%]">
            <p className="text-[24px] text-[rgba(255,255,255,0.5)]">CPM</p>
            <p key={`cpm-${lastStats?.cpm}`} className={`text-[32px] text-white ${flashMap.cpm ? `stat-flash-${flashMap.cpm}` : ''}`}>{lastStats ? lastStats.cpm : '—'}</p>
            <div className="absolute right-0 top-[5px] h-[77px] w-[1px]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1 77">
                <line opacity="0.1" stroke="white" x1="0.5" y1="0" x2="0.5" y2="77" />
              </svg>
            </div>
          </div>

          {/* Accuracy */}
          <div className="flex flex-col items-center gap-[15px] relative w-[30%]">
            <p className="text-[24px] text-[rgba(255,255,255,0.5)]">ACCURACY</p>
            <p key={`acc-${lastStats?.accuracy}`} className={`text-[32px] text-white ${flashMap.accuracy ? `stat-flash-${flashMap.accuracy}` : ''}`}>{lastStats ? `${lastStats.accuracy}%` : '—'}</p>
            <div className="absolute right-0 top-[5px] h-[77px] w-[1px]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1 77">
                <line opacity="0.1" stroke="white" x1="0.5" y1="0" x2="0.5" y2="77" />
              </svg>
            </div>
          </div>

          {/* Correct Characters */}
          <div className="flex flex-col items-center gap-[15px] relative w-[40%]">
            <p className="text-[24px] text-[rgba(255,255,255,0.5)] whitespace-nowrap">Correct Characters</p>
            <p key={`cor-${lastStats?.correct}`} className={`text-[32px] text-white ${flashMap.correct ? `stat-flash-${flashMap.correct}` : ''}`}>{lastStats ? lastStats.correct : '—'}</p>
            <div className="absolute right-0 top-[5px] h-[77px] w-[1px]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1 77">
                <line opacity="0.1" stroke="white" x1="0.5" y1="0" x2="0.5" y2="77" />
              </svg>
            </div>
          </div>

          {/* Incorrect */}
          <div className="flex flex-col items-center gap-[15px] w-[25%]">
            <p className="text-[24px] text-[rgba(255,255,255,0.5)]">Incorrect</p>
            <p key={`inc-${lastStats?.incorrect}`} className={`text-[32px] text-white ${flashMap.incorrect ? `stat-flash-${flashMap.incorrect}` : ''}`}>{lastStats ? lastStats.incorrect : '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
