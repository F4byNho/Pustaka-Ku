/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect, useRef } from "react";
import { parseRawCitation, transformWithTemplate, CitationType, FieldFormats } from "./lib/citationEngine";
import { Copy, CheckSquare, Square, FileText, Book, Globe, Mic, ChevronDown, ChevronRight, AlertTriangle, Download, Save, History, Trash2, X } from "lucide-react";

type SessionLog = {
  id: string;
  timestamp: number;
  inputText: string;
  sortOrder: "none" | "asc" | "desc";
  activeTypes: Record<string, boolean>;
  templates: Record<string, string>;
  formatOptions: FieldFormats;
  removeDuplicates: boolean;
};

export default function App() {
  const [inputText, setInputText] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);

  // Efek untuk clear text editor ketika state inputText kosong
  useEffect(() => {
    if (inputText === "" && editorRef.current) {
      editorRef.current.innerHTML = "";
    }
  }, [inputText]);

  const [sortOrder, setSortOrder] = useState<"none" | "asc" | "desc">("asc");
  const [activeTypes, setActiveTypes] = useState<Record<string, boolean>>({
    'article-journal': true,
    'book': true,
    'paper-conference': true,
    'webpage': true,
  });

  const [isCopied, setIsCopied] = useState(false);

  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<Record<string, string>>({
    'article-journal': '{authors}. {year}. {title}. {journal}. {volume}({issue}): {pages}.',
    'book': '{authors}. {year}. {title}. {publisher}, {city}, {pages} hlm.',
    'paper-conference': '{authors}. {year}. {title}. Dalam: {proceedingName}. {date}. {city}, {country}, pp. {pages}.',
    'webpage': '{authors}. {year}. {title}. {url} ({accessDate}).'
  });

  const [formatOptions, setFormatOptions] = useState<FieldFormats>({
    'article-journal': { title: false, journal: false },
    'book': { title: false, publisher: false },
    'paper-conference': { title: false, proceedingName: false },
    'webpage': { title: false },
  });

  const [removeDuplicates, setRemoveDuplicates] = useState(true);

  // Riwayat Logs
  const [logs, setLogs] = useState<SessionLog[]>(() => {
    const saved = localStorage.getItem("dafpus_sessionLogs");
    return saved ? JSON.parse(saved) : [];
  });
  const [isLogsOpen, setIsLogsOpen] = useState(false);

  const [isSaved, setIsSaved] = useState(false);

  const handleSaveLocal = () => {
    if (!inputText.trim()) return;
    const newLog: SessionLog = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      inputText,
      sortOrder,
      activeTypes,
      templates,
      formatOptions,
      removeDuplicates
    };
    const newLogs = [newLog, ...logs];
    setLogs(newLogs);
    localStorage.setItem("dafpus_sessionLogs", JSON.stringify(newLogs));
    
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleLoadLog = (log: SessionLog) => {
    setInputText(log.inputText);
    setSortOrder(log.sortOrder);
    setActiveTypes(log.activeTypes);
    setTemplates(log.templates);
    setFormatOptions(log.formatOptions);
    setRemoveDuplicates(log.removeDuplicates);
    
    // update editor view
    if (editorRef.current) {
      const lines = log.inputText.split(/\r?\n/).filter(line => line.trim() !== "");
      const html = lines.map(line => `<div>${line}</div>`).join("");
      editorRef.current.innerHTML = html;
    }
    setIsLogsOpen(false);
  };

  const handleDeleteLog = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newLogs = logs.filter(l => l.id !== id);
    setLogs(newLogs);
    localStorage.setItem("dafpus_sessionLogs", JSON.stringify(newLogs));
  };

  const handleTypeToggle = (type: string) => {
    setActiveTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const handleSelectAll = (checked: boolean) => {
    setActiveTypes({
      'article-journal': checked,
      'book': checked,
      'paper-conference': checked,
      'webpage': checked,
    });
  };

  const isAllSelected = Object.values(activeTypes).every(Boolean);

  const outputLines = useMemo(() => {
    const lines = inputText.split("\n").map(l => l.trim()).filter(l => l.length > 0);

    const seenKeys = new Set<string>();

    let processedObj = lines.map(line => {
      const parsed = parseRawCitation(line);
      
      let reformatted = line;
      let ignored = false;
      let typeLabel = "Unknown";

      if (parsed.isValid) {
        if (activeTypes[parsed.type]) {
          reformatted = transformWithTemplate(parsed, templates[parsed.type] || "", formatOptions);
        } else {
          ignored = true;
        }

        switch (parsed.type) {
          case 'article-journal': typeLabel = "Jurnal"; break;
          case 'book': typeLabel = "Buku"; break;
          case 'paper-conference': typeLabel = "Prosiding"; break;
          case 'webpage': typeLabel = "Website"; break;
        }
      }

      let sortKey = parsed.authors && parsed.authors.length > 0 ? parsed.authors[0].toLowerCase() : line.toLowerCase();
      sortKey = sortKey.replace(/^[^a-z]+/, "");
      
      // Buat key unik untuk deteksi duplikat (menggabungkan author, tahun, dan judul yang dinormalisasi)
      const dedupeKey = parsed.isValid 
        ? `${parsed.authors.join('').toLowerCase().replace(/[^a-z0-9]/g, '')}-${parsed.year}-${parsed.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`
        : line.toLowerCase().replace(/[^a-z0-9]/g, '');

      return { 
        original: line, 
        reformatted, 
        sortKey, 
        dedupeKey,
        isValid: parsed.isValid,
        type: parsed.type,
        typeLabel,
        ignored
      };
    });

    if (removeDuplicates) {
      processedObj = processedObj.filter(item => {
        if (seenKeys.has(item.dedupeKey)) return false;
        seenKeys.add(item.dedupeKey);
        return true;
      });
    }

    if (sortOrder !== "none") {
      processedObj = [...processedObj].sort((a, b) => {
        if (a.sortKey < b.sortKey) return sortOrder === "asc" ? -1 : 1;
        if (a.sortKey > b.sortKey) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }

    return processedObj;
  }, [inputText, sortOrder, activeTypes, templates, formatOptions, removeDuplicates]);

  const handleCopyAll = () => {
    // Hanya ambil item yang valid DAN tidak diabaikan
    const lines = outputLines
      .filter(item => item.isValid && !item.ignored)
      .map(item => {
        const plain = item.reformatted.replace(/<\/?i>/g, '');
        return { plain, html: item.reformatted };
      });

    const plainText = lines.map(l => l.plain).join('\n');
    // Tiap pustaka = <p> sendiri agar Word mengenali sebagai paragraf terpisah
    const pStyle = [
      'font-family:Times New Roman,serif',
      'font-size:12pt',
      'margin-top:0',
      'margin-bottom:0',
      'text-align:justify',
      'text-indent:-36pt',   // hanging indent
      'margin-left:36pt',
    ].join(';');
    const htmlText = `<html><body>${
      lines.map(l => `<p style="${pStyle}">${l.html}</p>`).join('')
    }</body></html>`;

    try {
      // ClipboardItem: tempel ke Word dengan italic, ke Notepad dengan plain text
      const item = new ClipboardItem({
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob([htmlText], { type: 'text/html' }),
      });
      navigator.clipboard.write([item]);
    } catch {
      // Fallback untuk browser yang tidak mendukung ClipboardItem
      navigator.clipboard.writeText(plainText);
    }

    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadWord = () => {
    const lines = outputLines
      .filter(item => item.isValid && !item.ignored)
      .map(item => item.reformatted);

    const pStyle = [
      'font-family:Times New Roman,serif',
      'font-size:12pt',
      'margin-top:0',
      'margin-bottom:0',
      'text-align:justify',
      'text-indent:-36pt',
      'margin-left:36pt',
    ].join(';');

    const htmlText = `<html>
      <head><meta charset="utf-8"></head>
      <body>${lines.map(html => `<p style="${pStyle}">${html}</p>`).join('')}</body>
    </html>`;

    const blob = new Blob([htmlText], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Daftar_Pustaka.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSortAsc = () => setSortOrder(prev => prev === "asc" ? "none" : "asc");
  const handleSortDesc = () => setSortOrder(prev => prev === "desc" ? "none" : "desc");

  const validLinesCount = inputText.split("\n").map(l => l.trim()).filter(l => l.length > 0).length;
  const duplicateCount = removeDuplicates ? (validLinesCount - outputLines.length) : 0;

  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-[#050505] text-gray-300 font-sans relative selection:bg-white/20 selection:text-white scroll-smooth">
      {/* Decorative Glows */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] bg-indigo-900/10 rounded-full blur-[100px]"></div>
      </div>

      <header className="h-16 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-10 shrink-0 relative">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Pustaka-Ku Logo" className="w-8 h-8 rounded-full object-cover" />
          <h1 className="text-xl font-medium tracking-tighter text-white">Pustaka-Ku</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={handleSaveLocal}
            className={`px-3 py-2 sm:px-4 rounded-lg text-xs font-medium flex items-center gap-2 transition-all border ${isSaved ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"}`}
          >
            {isSaved ? <CheckSquare className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{isSaved ? "Tersimpan!" : "Simpan Sesi"}</span>
          </button>
          <button
            onClick={() => setIsLogsOpen(true)}
            className="px-3 py-2 sm:px-4 rounded-lg text-xs font-medium flex items-center gap-2 transition-all border bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
          >
            <History className="w-4 h-4" />
            <span>Riwayat</span>
          </button>
        </div>
      </header>

      {/* Logs Modal */}
      {isLogsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#050505]">
              <h2 className="text-white font-medium flex items-center gap-2">
                <History className="w-5 h-5 text-gray-400" /> Riwayat Sesi Tersimpan
              </h2>
              <button onClick={() => setIsLogsOpen(false)} className="p-1 rounded-full hover:bg-white/10 text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar flex flex-col gap-3">
              {logs.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-sm italic">
                  Belum ada sesi yang tersimpan.
                </div>
              ) : (
                logs.map(log => (
                  <div 
                    key={log.id} 
                    onClick={() => handleLoadLog(log)}
                    className="p-3 border border-white/5 bg-white/5 hover:bg-white/10 rounded-xl cursor-pointer transition-colors group flex justify-between items-start"
                  >
                    <div className="flex flex-col gap-1 pr-4">
                      <span className="text-sm text-gray-200 font-medium">
                        {new Date(log.timestamp).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                      <span className="text-xs text-gray-500 line-clamp-2">
                        {log.inputText || "Sesi Kosong"}
                      </span>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteLog(e, log.id)}
                      className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="Hapus riwayat ini"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col p-4 sm:p-6 gap-4 sm:gap-6 z-10 w-full max-w-7xl mx-auto xl:max-w-none min-h-0">
        
        {/* Warning Banner */}
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 sm:p-4 text-amber-200/90 shrink-0">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
          <div className="text-sm font-light leading-relaxed">
            <span className="font-medium text-amber-500">Perhatian:</span> Harap periksa kembali hasil pustaka yang dihasilkan. Format keluaran bisa jadi belum sepenuhnya sesuai.
          </div>
        </div>

        {/* Top Control Bar */}
        <section className="glass-card rounded-2xl p-3 sm:p-4 shrink-0 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-widest mr-1 sm:mr-2 shrink-0">Deteksi:</span>
            <button 
              onClick={() => handleSelectAll(!isAllSelected)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors border ${isAllSelected ? "bg-white/10 border-white/10 text-white" : "bg-white/5 border-white/5 text-gray-400 hover:bg-white/10"}`}
            >
              {isAllSelected ? <CheckSquare className="w-3.5 h-3.5 text-sky-400"/> : <Square className="w-3.5 h-3.5 text-gray-500"/>}
              Semua
            </button>
            <button 
              onClick={() => handleTypeToggle('article-journal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors border ${activeTypes['article-journal'] ? "bg-white/10 border-white/10 text-white" : "bg-white/5 border-white/5 text-gray-400 hover:bg-white/10"}`}
            >
              {activeTypes['article-journal'] ? <CheckSquare className="w-3.5 h-3.5 text-sky-400"/> : <Square className="w-3.5 h-3.5 text-gray-500"/>}
              Jurnal
            </button>
            <button 
              onClick={() => handleTypeToggle('book')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors border ${activeTypes['book'] ? "bg-white/10 border-white/10 text-white" : "bg-white/5 border-white/5 text-gray-400 hover:bg-white/10"}`}
            >
              {activeTypes['book'] ? <CheckSquare className="w-3.5 h-3.5 text-sky-400"/> : <Square className="w-3.5 h-3.5 text-gray-500"/>}
              Buku
            </button>
            <button 
              onClick={() => handleTypeToggle('paper-conference')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors border ${activeTypes['paper-conference'] ? "bg-white/10 border-white/10 text-white" : "bg-white/5 border-white/5 text-gray-400 hover:bg-white/10"}`}
            >
              {activeTypes['paper-conference'] ? <CheckSquare className="w-3.5 h-3.5 text-sky-400"/> : <Square className="w-3.5 h-3.5 text-gray-500"/>}
              Prosiding
            </button>
            <button 
              onClick={() => handleTypeToggle('webpage')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors border ${activeTypes['webpage'] ? "bg-white/10 border-white/10 text-white" : "bg-white/5 border-white/5 text-gray-400 hover:bg-white/10"}`}
            >
              {activeTypes['webpage'] ? <CheckSquare className="w-3.5 h-3.5 text-sky-400"/> : <Square className="w-3 h-3 text-gray-500"/>}
              Website
            </button>
          </div>
          
          <div className="flex items-center justify-between lg:justify-end gap-2 w-full lg:w-auto border-t lg:border-t-0 border-white/5 pt-3 lg:pt-0">
            <button
              onClick={() => setRemoveDuplicates(!removeDuplicates)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors border mr-2 relative ${removeDuplicates ? "bg-white/10 border-white/10 text-white" : "bg-white/5 border-white/5 text-gray-400 hover:bg-white/10"}`}
              title="Hapus daftar pustaka yang ganda/duplikat"
            >
              {removeDuplicates ? <CheckSquare className="w-3.5 h-3.5 text-sky-400" /> : <Square className="w-3.5 h-3.5 text-gray-500" />}
              Hapus Duplikat
            </button>

            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-widest mr-2 shrink-0 hidden sm:inline-block">Sortir:</span>
            <div className="flex bg-black/40 border border-white/5 rounded-lg p-1 w-full lg:w-auto">
              <button 
                onClick={handleSortAsc}
                className={`flex-1 lg:flex-none py-1.5 px-4 text-xs font-medium transition-all rounded-md ${sortOrder === "asc" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
              >
                A-Z
              </button>
              <button 
                onClick={handleSortDesc}
                className={`flex-1 lg:flex-none py-1.5 px-4 text-xs font-medium transition-all rounded-md ${sortOrder === "desc" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
              >
                Z-A
              </button>
            </div>
          </div>
        </section>

        {/* Template Settings Dropdown */}
        <section className="glass-card rounded-2xl shrink-0 border border-white/5 overflow-hidden">
          <button 
            onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
            className="w-full flex justify-between items-center px-4 py-3 bg-black/20 hover:bg-white/5 transition-colors text-xs font-medium text-gray-300"
          >
            <div className="flex flex-col items-start text-left">
              <span className="text-white text-sm">Sesuaikan Acuan Format</span>
              <span className="text-[10px] text-gray-500 mt-0.5">Edit struktur format pustaka untuk tiap tipe</span>
            </div>
            <div className="p-1 rounded-full bg-white/5">
              {isTemplatesOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            </div>
          </button>
          
          {isTemplatesOpen && (
            <div className="p-4 bg-black/40 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(activeTypes).filter(t => activeTypes[t]).map(typeId => {
                let label = "Jurnal";
                if (typeId === 'book') label = "Buku";
                if (typeId === 'paper-conference') label = "Prosiding";
                if (typeId === 'webpage') label = "Website";
                
                return (
                  <div key={typeId} className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-sky-400 uppercase tracking-widest font-mono font-medium">{label}</label>
                    <input 
                      type="text" 
                      value={templates[typeId] || ""}
                      onChange={(e) => setTemplates(t => ({...t, [typeId]: e.target.value}))}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-xs text-gray-300 focus:outline-none focus:border-sky-500/50 focus:bg-[#050505] transition-all font-mono"
                    />
                    <div className="flex flex-wrap gap-3 mt-1 items-center">
                      <span className="text-[10px] text-gray-500">Cetak Miring (Italic):</span>
                      {typeId === 'article-journal' && (
                        <>
                          <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                            <input type="checkbox" checked={formatOptions['article-journal'].title} onChange={e => setFormatOptions(prev => ({...prev, 'article-journal': {...prev['article-journal'], title: e.target.checked}}))} className="accent-sky-500" />
                            Judul
                          </label>
                          <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                            <input type="checkbox" checked={formatOptions['article-journal'].journal} onChange={e => setFormatOptions(prev => ({...prev, 'article-journal': {...prev['article-journal'], journal: e.target.checked}}))} className="accent-sky-500" />
                            Nama Jurnal
                          </label>
                        </>
                      )}
                      {typeId === 'book' && (
                        <>
                          <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                            <input type="checkbox" checked={formatOptions['book'].title} onChange={e => setFormatOptions(prev => ({...prev, 'book': {...prev['book'], title: e.target.checked}}))} className="accent-sky-500" />
                            Judul Buku
                          </label>
                          <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                            <input type="checkbox" checked={formatOptions['book'].publisher} onChange={e => setFormatOptions(prev => ({...prev, 'book': {...prev['book'], publisher: e.target.checked}}))} className="accent-sky-500" />
                            Penerbit
                          </label>
                        </>
                      )}
                      {typeId === 'paper-conference' && (
                        <>
                          <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                            <input type="checkbox" checked={formatOptions['paper-conference'].title} onChange={e => setFormatOptions(prev => ({...prev, 'paper-conference': {...prev['paper-conference'], title: e.target.checked}}))} className="accent-sky-500" />
                            Judul
                          </label>
                          <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                            <input type="checkbox" checked={formatOptions['paper-conference'].proceedingName} onChange={e => setFormatOptions(prev => ({...prev, 'paper-conference': {...prev['paper-conference'], proceedingName: e.target.checked}}))} className="accent-sky-500" />
                            Nama Prosiding
                          </label>
                        </>
                      )}
                      {typeId === 'webpage' && (
                        <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                          <input type="checkbox" checked={formatOptions['webpage'].title} onChange={e => setFormatOptions(prev => ({...prev, 'webpage': {...prev['webpage'], title: e.target.checked}}))} className="accent-sky-500" />
                          Judul
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
              {Object.keys(activeTypes).filter(t => activeTypes[t]).length === 0 && (
                <div className="col-span-full text-xs text-center text-gray-500 py-2">
                  Tidak ada tipe yang dipilih.
                </div>
              )}
              <div className="col-span-full mt-2 text-[10px] sm:text-xs text-gray-500 font-mono leading-relaxed bg-white/5 p-3 rounded-lg flex flex-col gap-2">
                <span className="text-gray-400 font-medium font-sans text-xs mb-1">Daftar Tag (Placeholder):</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-1.5">
                  <span><span className="text-gray-400">{`{authors}`}</span> = Penulis</span>
                  <span><span className="text-gray-400">{`{year}`}</span> = Tahun</span>
                  <span><span className="text-gray-400">{`{title}`}</span> = Judul</span>
                  <span><span className="text-gray-400">{`{journal}`}</span> = Nama Jurnal</span>
                  <span><span className="text-gray-400">{`{volume}`}</span> = Volume</span>
                  <span><span className="text-gray-400">{`{issue}`}</span> = Nomor/Isu</span>
                  <span><span className="text-gray-400">{`{pages}`}</span> = Halaman</span>
                  <span><span className="text-gray-400">{`{city}`}</span> = Kota Terbit</span>
                  <span><span className="text-gray-400">{`{publisher}`}</span> = Penerbit</span>
                  <span><span className="text-gray-400">{`{country}`}</span> = Negara</span>
                  <span><span className="text-gray-400">{`{proceedingName}`}</span> = Nama Prosiding</span>
                  <span><span className="text-gray-400">{`{url}`}</span> = Tautan/URL</span>
                  <span><span className="text-gray-400">{`{accessDate}`}</span> = Tgl Akses</span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="flex-1 flex flex-col xl:flex-row gap-6 min-h-0">
          <div className="xl:flex-1 w-full flex flex-col glass-card rounded-3xl h-[400px] xl:h-[450px] 2xl:h-[550px] min-h-0">
            <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center shrink-0 min-h-[72px]">
              <label className="text-sm font-medium text-white tracking-wide">
                Input Daftar Pustaka Mentah
              </label>
              {inputText && (
                <button
                  onClick={() => setInputText("")}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all duration-200"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Sub-header for info */}
            {validLinesCount > 0 && (
              <div className="px-6 py-3 border-b border-white/5 bg-[#0a0a0a]/50 flex justify-between items-center shrink-0">
                <span className="text-xs text-gray-500 font-light">
                  Mendeteksi {validLinesCount} baris pustaka mentah.
                </span>
              </div>
            )}
            <div 
              ref={editorRef}
              contentEditable
              onInput={(e) => setInputText(e.currentTarget.innerText)}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData('text/plain');
                if (!text) return;
                
                // Pisahkan per baris lalu bungkus dengan div yang punya class hanging indent
                const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
                const html = lines.map(line => `<div>${line}</div>`).join("");
                
                document.execCommand('insertHTML', false, html);
              }}
              data-placeholder="Masukkan Pustaka di sini"
              className="flex-1 p-6 sm:p-8 lg:p-10 font-light text-[15px] sm:text-base leading-relaxed sm:leading-loose text-gray-300 focus:outline-none min-h-0 w-full bg-transparent overflow-y-auto overscroll-contain text-justify custom-scrollbar touch-pan-y empty:before:content-[attr(data-placeholder)] empty:before:text-gray-600 empty:before:pointer-events-none [&>div]:pl-8 sm:[&>div]:pl-10 [&>div]:-indent-8 sm:[&>div]:-indent-10"
            />
          </div>

          <div className="xl:flex-1 w-full flex flex-col glass-card rounded-3xl h-[400px] xl:h-[450px] 2xl:h-[550px] min-h-0 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none z-0"></div>

            <div className="px-4 sm:px-6 py-4 border-b border-white/5 flex flex-row justify-between items-center gap-2 shrink-0 relative z-10 min-h-[72px]">
              <label className="text-sm font-medium text-white tracking-wide truncate">
                Output Daftar Pustaka
              </label>

              {outputLines.length > 0 && (
                <div className="flex items-center gap-2 w-auto justify-end shrink-0">
                  <button 
                    className="flex-none justify-center px-3 py-2 rounded-lg font-medium text-xs flex items-center gap-1.5 transition-all duration-300 ease-out border bg-blue-600/10 text-blue-400 border-blue-500/20 hover:bg-blue-600/20 hover:border-blue-500/40 whitespace-nowrap"
                    onClick={handleDownloadWord}
                    title="Download sebagai file Word (.doc)"
                  >
                    <Download className="w-4 h-4" /> Word
                  </button>
                  <button 
                    className={`flex-none justify-center px-4 py-2 rounded-lg font-medium text-xs flex items-center gap-1.5 transition-all duration-300 ease-out border whitespace-nowrap ${isCopied ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white text-black border-transparent hover:bg-gray-200'}`}
                    onClick={handleCopyAll}
                  >
                    {isCopied ? (
                       <>
                         <CheckSquare className="w-4 h-4" /> Copied!
                       </>
                    ) : (
                       <>
                         <Copy className="w-4 h-4" /> Copy
                       </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Sub-header for info & badge */}
            {outputLines.length > 0 && (
              <div className="px-6 py-3 border-b border-white/5 bg-[#0a0a0a]/50 flex justify-between items-center shrink-0 relative z-10">
                <span className="text-xs text-gray-500 font-light">
                  Menampilkan {outputLines.filter(item => item.isValid && !item.ignored).length} pustaka hasil proses.
                </span>
                {duplicateCount > 0 && removeDuplicates && (
                  <span className="bg-amber-500/10 border border-amber-500/30 text-amber-500 px-2.5 py-1 rounded-md text-[10px] font-medium tracking-wide">
                    {duplicateCount} Duplikat Dihapus
                  </span>
                )}
              </div>
            )}
            
            <div className="flex-1 bg-transparent relative z-10 flex flex-col min-h-0">
              <div className="flex-1 p-6 sm:p-8 lg:p-10 overflow-y-auto overscroll-contain selection:bg-white/20 selection:text-white min-h-0 custom-scrollbar touch-pan-y w-full">
                <div className="w-full">
                  {outputLines.length === 0 ? (
                    <div className="min-h-[150px] h-full flex flex-col items-center justify-center text-gray-600 font-light text-sm italic py-20">
                      <span>Hasil format akan muncul di sini.</span>
                    </div>
                  ) : (
                    <div className="font-light text-[15px] sm:text-base leading-relaxed sm:leading-loose text-gray-300 space-y-0 text-justify">
                      {outputLines.map((item, idx) => {
                        const currentText = item.reformatted;

                      return (
                        <div key={idx} className="pl-8 sm:pl-10 -indent-8 sm:-indent-10 group/item relative">
                          {!item.isValid ? (
                            <span className="text-gray-500 italic text-sm font-light">
                              {currentText} 
                              <span className="inline-flex indent-0 whitespace-nowrap text-[10px] sm:text-xs border border-red-500/30 bg-red-500/10 text-red-400 rounded px-2 py-0.5 ml-2 font-medium tracking-wide align-middle mb-0.5 mt-1 sm:mt-0">Gagal Mendeteksi Tipe</span>
                            </span>
                          ) : item.ignored ? (
                             <span className="text-gray-500 text-sm font-light">
                               {currentText} 
                               <span className="inline-flex indent-0 whitespace-nowrap text-[10px] sm:text-xs border border-white/10 bg-white/5 text-gray-400 rounded px-2 py-0.5 ml-2 font-medium tracking-wide align-middle mb-0.5 mt-1 sm:mt-0">Diabaikan ({item.typeLabel})</span>
                             </span>
                          ) : (
                            // dangerouslySetInnerHTML hanya untuk render <i> nama ilmiah
                            // Aman: hanya tag <i>...</i> yang dihasilkan oleh formatScientificNames
                            <span
                              className="text-gray-300"
                              dangerouslySetInnerHTML={{ __html: currentText }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>


              </div>
            </div>

          </div>
        </section>
      </main>

      <footer className="py-4 px-4 sm:px-6 border-t border-white/5 flex justify-center items-center shrink-0 z-10 bg-[#050505]/80 backdrop-blur-md">
        <p className="text-xs text-gray-500 font-medium tracking-wider">Dibuat oleh Faris</p>
      </footer>
    </div>
  );
}

