import os
import sys
import re
import tkinter as tk
from tkinter import ttk, messagebox
from tkinter.scrolledtext import ScrolledText
import threading
import queue

# Adicionar pasta local ao path para garantir que consiga importar fiplan_downloader
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.append(script_dir)

import fiplan_downloader

class ControlFlags:
    def __init__(self):
        self.is_paused = False
        self.is_stopped = False

class FiplanApp:
    def __init__(self, root):
        self.root = root
        self.root.title("FIPLAN Downloader por Credor - Painel de Controle")
        self.root.geometry("850x650")
        self.root.minsize(800, 550)
        
        # Configurar tema escuro/moderno para a janela
        self.bg_color = "#1e222b"
        self.fg_color = "#ffffff"
        self.accent_color = "#4a90e2"
        self.panel_bg = "#21252b"
        self.btn_active = "#3a3f4b"
        
        self.root.configure(bg=self.bg_color)
        
        # Variáveis de controle de threading e flags
        self.control_flags = ControlFlags()
        self.gui_queue = queue.Queue()
        self.worker_thread = None
        
        # Elementos da interface
        self.setup_ui()
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        
        # Iniciar monitoramento da fila de logs
        self.poll_queue()
        
    def setup_ui(self):
        # Configurar estilos ttk personalizados
        style = ttk.Style()
        style.theme_use('clam')
        style.configure("TLabel", background=self.bg_color, foreground=self.fg_color, font=("Segoe UI", 10))
        style.configure("TEntry", fieldbackground="#282c34", foreground=self.fg_color, insertcolor=self.fg_color)
        style.configure("TCheckbutton", background=self.bg_color, foreground=self.fg_color, font=("Segoe UI", 10))
        
        # Grid layout principal
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(2, weight=1) # O console de logs expande
        
        # --- 1. CABEÇALHO DO APLICATIVO ---
        header_frame = tk.Frame(self.root, bg=self.panel_bg, height=60, bd=1, relief="ridge")
        header_frame.grid(row=0, column=0, sticky="ew", padx=10, pady=10)
        header_frame.columnconfigure(0, weight=1)
        
        title_label = tk.Label(header_frame, text="Oliveira Junior - FIPLAN Downloader", bg=self.panel_bg, fg="#4a90e2", font=("Segoe UI", 14, "bold"))
        title_label.grid(row=0, column=0, sticky="w", padx=15, pady=5)
        
        self.status_label = tk.Label(header_frame, text="STATUS: PARADO", bg=self.panel_bg, fg="#dc3545", font=("Segoe UI", 10, "bold"), bd=1, relief="sunken", padx=10, pady=3)
        self.status_label.grid(row=0, column=1, sticky="e", padx=15, pady=5)
        
        # --- 2. PAINEL DE CONFIGURAÇÕES ---
        config_frame = tk.LabelFrame(self.root, text=" Configurações de Busca ", bg=self.bg_color, fg=self.accent_color, font=("Segoe UI", 11, "bold"), bd=2, relief="groove")
        config_frame.grid(row=1, column=0, sticky="ew", padx=10, pady=5)
        config_frame.columnconfigure(1, weight=1)
        
        # Entrada de Anos
        tk.Label(config_frame, text="Exercícios (Anos):", bg=self.bg_color, fg=self.fg_color).grid(row=0, column=0, sticky="w", padx=10, pady=5)
        self.entry_years = ttk.Entry(config_frame, font=("Segoe UI", 10))
        self.entry_years.insert(0, "2019-2026")
        self.entry_years.grid(row=0, column=1, sticky="ew", padx=10, pady=5)
        
        # Checkboxes de Tipos de Documentos
        tk.Label(config_frame, text="Documentos:", bg=self.bg_color, fg=self.fg_color).grid(row=1, column=0, sticky="w", padx=10, pady=5)
        
        docs_frame = tk.Frame(config_frame, bg=self.bg_color)
        docs_frame.grid(row=1, column=1, sticky="w", padx=5, pady=5)
        
        self.var_emp = tk.BooleanVar(value=True)
        self.var_nob = tk.BooleanVar(value=True)
        self.var_ped = tk.BooleanVar(value=True)
        self.var_all = tk.BooleanVar(value=True)
        
        self.chk_emp = ttk.Checkbutton(docs_frame, text="EMP (Empenho)", variable=self.var_emp, command=self.on_doc_toggle)
        self.chk_emp.grid(row=0, column=0, padx=5)
        
        self.chk_nob = ttk.Checkbutton(docs_frame, text="NOB (Pagamento)", variable=self.var_nob, command=self.on_doc_toggle)
        self.chk_nob.grid(row=0, column=1, padx=5)
        
        self.chk_ped = ttk.Checkbutton(docs_frame, text="PED (Pedido)", variable=self.var_ped, command=self.on_doc_toggle)
        self.chk_ped.grid(row=0, column=2, padx=5)
        
        self.chk_all = ttk.Checkbutton(docs_frame, text="Selecionar Todos", variable=self.var_all, command=self.on_select_all)
        self.chk_all.grid(row=0, column=3, padx=15)
        
        # Entrada de Filtro de Credor
        tk.Label(config_frame, text="Credor Específico:", bg=self.bg_color, fg=self.fg_color).grid(row=2, column=0, sticky="w", padx=10, pady=5)
        self.entry_creditor = ttk.Entry(config_frame, font=("Segoe UI", 10))
        self.entry_creditor.insert(0, "TODOS")
        self.entry_creditor.grid(row=2, column=1, sticky="ew", padx=10, pady=5)
        
        # Checkbox Navegador Oculto
        self.var_headless = tk.BooleanVar(value=False)
        self.chk_headless = ttk.Checkbutton(config_frame, text="Executar em segundo plano (Ocultar navegador Chrome)", variable=self.var_headless)
        self.chk_headless.grid(row=3, column=1, sticky="w", padx=10, pady=5)
        
        # --- 3. CONSOLE DE LOGS ---
        console_frame = tk.LabelFrame(self.root, text=" Console de Operação ", bg=self.bg_color, fg=self.accent_color, font=("Segoe UI", 11, "bold"), bd=2, relief="groove")
        console_frame.grid(row=2, column=0, sticky="nsew", padx=10, pady=5)
        console_frame.columnconfigure(0, weight=1)
        console_frame.rowconfigure(0, weight=1)
        
        self.console_text = ScrolledText(console_frame, bg="#000000", fg="#00ff00", font=("Consolas", 9), wrap="word", bd=0)
        self.console_text.grid(row=0, column=0, sticky="nsew", padx=5, pady=5)
        self.console_text.insert(tk.END, ">>> Painel carregado. Pronto para iniciar.\n")
        self.console_text.configure(state="disabled")
        
        # --- 4. BOTOES DE CONTROLE (PLAY/PAUSE/STOP) ---
        control_frame = tk.Frame(self.root, bg=self.bg_color)
        control_frame.grid(row=3, column=0, sticky="ew", padx=10, pady=10)
        
        # Estilos dos botões usando tk tradicional para compatibilidade e coloração customizada
        self.btn_play = tk.Button(control_frame, text="▶  Iniciar", bg="#28a745", fg="#ffffff", activebackground="#218838", activeforeground="#ffffff", font=("Segoe UI", 11, "bold"), width=15, bd=1, command=self.start_automation)
        self.btn_play.grid(row=0, column=0, padx=10, pady=5)
        
        self.btn_pause = tk.Button(control_frame, text="⏸  Pausar", bg="#ffc107", fg="#000000", activebackground="#e0a800", activeforeground="#000000", font=("Segoe UI", 11, "bold"), width=15, bd=1, state="disabled", command=self.toggle_pause)
        self.btn_pause.grid(row=0, column=1, padx=10, pady=5)
        
        self.btn_stop = tk.Button(control_frame, text="⏹  Parar", bg="#dc3545", fg="#ffffff", activebackground="#c82333", activeforeground="#ffffff", font=("Segoe UI", 11, "bold"), width=15, bd=1, state="disabled", command=self.stop_automation)
        self.btn_stop.grid(row=0, column=2, padx=10, pady=5)
        
        self.btn_clear = tk.Button(control_frame, text="Limpar Console", bg="#6c757d", fg="#ffffff", activebackground="#5a6268", activeforeground="#ffffff", font=("Segoe UI", 9), width=15, bd=1, command=self.clear_console)
        self.btn_clear.grid(row=0, column=3, padx=15, pady=5)

    # Lógica dos Checkboxes
    def on_select_all(self):
        val = self.var_all.get()
        self.var_emp.set(val)
        self.var_nob.set(val)
        self.var_ped.set(val)
        
    def on_doc_toggle(self):
        if self.var_emp.get() and self.var_nob.get() and self.var_ped.get():
            self.var_all.set(True)
        else:
            self.var_all.set(False)

    def write_log(self, text):
        """Escreve um texto no console e faz auto-scroll."""
        self.console_text.configure(state="normal")
        self.console_text.insert(tk.END, text + "\n")
        self.console_text.see(tk.END)
        self.console_text.configure(state="disabled")

    def clear_console(self):
        self.console_text.configure(state="normal")
        self.console_text.delete(1.0, tk.END)
        self.console_text.configure(state="disabled")

    def parse_years(self, years_str):
        """Converte strings como '2019-2026' ou '2020, 2024' em lista de strings de anos."""
        years = []
        parts = re.split(r'[,\s]+', years_str.strip())
        for part in parts:
            if not part:
                continue
            if '-' in part:
                try:
                    start, end = part.split('-')
                    years.extend([str(y) for y in range(int(start), int(end) + 1)])
                except ValueError:
                    raise ValueError(f"Intervalo de anos inválido: {part}")
            else:
                if not part.isdigit() or len(part) != 4:
                    raise ValueError(f"Ano inválido: {part}")
                years.append(part)
        return sorted(list(set(years)))

    # --- FLUXO DE CONTROLE DA AUTOMAÇÃO ---
    def start_automation(self):
        # 1. Obter e validar parâmetros
        years_str = self.entry_years.get()
        try:
            parsed_years = self.parse_years(years_str)
        except ValueError as err:
            messagebox.showerror("Erro de Configuração", str(err))
            return
            
        selected_docs = []
        if self.var_emp.get(): selected_docs.append("EMP")
        if self.var_nob.get(): selected_docs.append("NOB")
        if self.var_ped.get(): selected_docs.append("PED")
        
        if not selected_docs:
            messagebox.showerror("Erro de Configuração", "Selecione pelo menos um tipo de documento para consulta (EMP, NOB ou PED).")
            return
            
        creditor_filter = self.entry_creditor.get().strip()
        headless = self.var_headless.get()
        
        # 2. Alterar estado dos botões e painéis
        self.toggle_inputs(state="disabled")
        self.btn_play.configure(state="disabled")
        self.btn_pause.configure(state="normal", text="⏸  Pausar")
        self.btn_stop.configure(state="normal")
        
        self.status_label.configure(text="STATUS: EXECUTANDO", fg="#28a745")
        
        # Resetar flags de controle
        self.control_flags.is_paused = False
        self.control_flags.is_stopped = False
        
        # 3. Disparar a automação em uma thread secundária
        self.write_log("\n>>> Preparando inicialização da automação...")
        
        def log_cb(msg):
            self.gui_queue.put(("LOG", msg))
            
        def thread_target():
            try:
                success = fiplan_downloader.run(
                    years_to_process=parsed_years,
                    document_types=selected_docs,
                    creditor_filter=creditor_filter,
                    headless_mode=headless,
                    log_callback=log_cb,
                    control_flags=self.control_flags
                )
                self.gui_queue.put(("FINISHED", success))
            except Exception as e:
                self.gui_queue.put(("FINISHED", False))
                self.gui_queue.put(("LOG", f"❌ Erro fatal na thread do robô: {e}"))
                
        self.worker_thread = threading.Thread(target=thread_target, daemon=True)
        self.worker_thread.start()

    def toggle_pause(self):
        if not self.control_flags.is_paused:
            self.control_flags.is_paused = True
            self.status_label.configure(text="STATUS: PAUSADO", fg="#ffc107")
            self.btn_pause.configure(text="▶  Retomar", bg="#28a745", fg="#ffffff")
        else:
            self.control_flags.is_paused = False
            self.status_label.configure(text="STATUS: EXECUTANDO", fg="#28a745")
            self.btn_pause.configure(text="⏸  Pausar", bg="#ffc107", fg="#000000")

    def stop_automation(self):
        if messagebox.askyesno("Parar Automação", "Deseja realmente interromper o robô? O progresso feito até agora será salvo no arquivo local."):
            self.control_flags.is_stopped = True
            self.control_flags.is_paused = False # Destrava o sleep do pause se estiver pausado
            self.status_label.configure(text="STATUS: PARANDO...", fg="#dc3545")
            self.btn_pause.configure(state="disabled")
            self.btn_stop.configure(state="disabled")

    def toggle_inputs(self, state="normal"):
        self.entry_years.configure(state=state)
        self.entry_creditor.configure(state=state)
        self.chk_emp.configure(state=state)
        self.chk_nob.configure(state=state)
        self.chk_ped.configure(state=state)
        self.chk_all.configure(state=state)
        self.chk_headless.configure(state=state)

    # --- PROCESSAMENTO DOS REQUERIMENTOS DA QUEUE ---
    def poll_queue(self):
        while True:
            try:
                msg_type, content = self.gui_queue.get_nowait()
                if msg_type == "LOG":
                    self.write_log(content)
                elif msg_type == "FINISHED":
                    self.on_automation_finished(success=content)
                self.gui_queue.task_done()
            except queue.Empty:
                break
        # Voltar a verificar a fila após 100 milissegundos
        self.root.after(100, self.poll_queue)

    def on_automation_finished(self, success):
        self.toggle_inputs(state="normal")
        self.btn_play.configure(state="normal")
        self.btn_pause.configure(state="disabled", text="⏸  Pausar", bg="#ffc107", fg="#000000")
        self.btn_stop.configure(state="disabled")
        
        if success:
            self.status_label.configure(text="STATUS: CONCLUÍDO", fg="#4a90e2")
            self.write_log("\n>>> Robô finalizou com sucesso toda a fila configurada.")
        else:
            self.status_label.configure(text="STATUS: INTERROMPIDO", fg="#dc3545")
            self.write_log("\n>>> O robô parou ou foi interrompido.")

    def on_closing(self):
        if self.worker_thread and self.worker_thread.is_alive():
            if messagebox.askyesno("Sair do Aplicativo", "O robô ainda está em execução. Deseja parar e fechar o aplicativo de forma segura?"):
                self.control_flags.is_stopped = True
                self.control_flags.is_paused = False
                self.root.destroy()
        else:
            self.root.destroy()

def main():
    root = tk.Tk()
    app = FiplanApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
