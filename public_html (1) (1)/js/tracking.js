// Sistema de Tracking Personalizado
class UserTracker {
    constructor(config = {}) {
        // Primeiro definir as propriedades básicas
        this.eventQueue = [];
        this.isTracking = false;
        this.pageLoadTime = Date.now();
        this.scrollDepth = 0;
        this.maxScrollDepth = 0;
        
        // Gerar sessionId DEPOIS de definir os métodos
        this.config = {
            endpoint: config.endpoint || 'tracker.php',
            sessionId: this.getOrCreateSessionId(),
            batchSize: config.batchSize || 10,
            flushInterval: config.flushInterval || 5000,
            trackClicks: config.trackClicks !== false,
            trackScrolls: config.trackScrolls !== false,
            trackFormInputs: config.trackFormInputs !== false,
            trackPageViews: config.trackPageViews !== false,
            trackRedirects: config.trackRedirects !== false,
            ...config
        };
        
        this.init();
    }
    
    getOrCreateSessionId() {
        // Tentar recuperar sessionId existente do localStorage
        let sessionId = localStorage.getItem('userTracker_sessionId');
        
        // Se não existe ou é muito antigo (mais de 30 minutos), criar novo
        const lastActivity = localStorage.getItem('userTracker_lastActivity');
        const now = Date.now();
        const thirtyMinutes = 30 * 60 * 1000; // 30 minutos em ms
        
        if (!sessionId || !lastActivity || (now - parseInt(lastActivity)) > thirtyMinutes) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            localStorage.setItem('userTracker_sessionId', sessionId);
            console.log('🆕 Nova sessão criada:', sessionId);
        } else {
            console.log('♻️ Sessão reutilizada:', sessionId);
        }
        
        // Atualizar última atividade
        localStorage.setItem('userTracker_lastActivity', now.toString());
        
        return sessionId;
    }
    
    init() {
        this.isTracking = true;
        
        // Track page load
        if (this.config.trackPageViews) {
            this.trackEvent('page_view', {
                url: window.location.href,
                title: document.title,
                referrer: document.referrer,
                loadTime: Date.now() - this.pageLoadTime
            });
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup periodic flush
        setInterval(() => this.flush(), this.config.flushInterval);
        
        // Heartbeat mais frequente para detectar usuários ativos (a cada 30 segundos)
        this.heartbeatInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.trackEvent('heartbeat', {
                    timestamp: Date.now(),
                    url: window.location.href,
                    isVisible: true
                });
            }
        }, 30000); // 30 segundos
        
        // Detectar quando usuário sai do site
        this.setupExitDetection();
        
        console.log('UserTracker initialized with session:', this.config.sessionId);
        
        // Debug: mostrar informações da sessão
        console.log('📊 Session Info:', {
            sessionId: this.config.sessionId,
            localStorage_sessionId: localStorage.getItem('userTracker_sessionId'),
            localStorage_lastActivity: localStorage.getItem('userTracker_lastActivity'),
            isNewSession: !localStorage.getItem('userTracker_sessionId')
        });
    }
    
    setupExitDetection() {
        // Detectar quando usuário sai da página
        window.addEventListener('beforeunload', () => {
            this.trackEvent('page_exit', {
                timestamp: Date.now(),
                url: window.location.href,
                exitType: 'beforeunload'
            });
            this.flush();
        });
        
        // Detectar quando usuário sai da aba (mas não fecha)
        window.addEventListener('pagehide', () => {
            this.trackEvent('page_exit', {
                timestamp: Date.now(),
                url: window.location.href,
                exitType: 'pagehide'
            });
            this.flush();
        });
        
        // Detectar quando a aba perde o foco
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.trackEvent('page_hidden', {
                    timestamp: Date.now(),
                    url: window.location.href
                });
                // Marcar como inativo após 2 minutos de aba oculta
                this.inactiveTimeout = setTimeout(() => {
                    this.trackEvent('user_inactive', {
                        timestamp: Date.now(),
                        url: window.location.href,
                        reason: 'tab_hidden_timeout'
                    });
                    this.flush();
                }, 120000); // 2 minutos
            } else {
                // Usuário voltou, cancelar timeout de inatividade
                if (this.inactiveTimeout) {
                    clearTimeout(this.inactiveTimeout);
                    this.inactiveTimeout = null;
                }
                this.trackEvent('page_visible', {
                    timestamp: Date.now(),
                    url: window.location.href
                });
            }
        });
        
        // Detectar inatividade do mouse/teclado
        let lastActivity = Date.now();
        const updateActivity = () => {
            lastActivity = Date.now();
            localStorage.setItem('userTracker_lastActivity', lastActivity.toString());
        };
        
        // Eventos que indicam atividade
        ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(event => {
            document.addEventListener(event, updateActivity, { passive: true });
        });
        
        // Verificar inatividade a cada minuto
        setInterval(() => {
            const now = Date.now();
            const timeSinceActivity = now - lastActivity;
            
            // Se inativo por mais de 3 minutos, marcar como inativo
            if (timeSinceActivity > 180000) { // 3 minutos
                this.trackEvent('user_inactive', {
                    timestamp: now,
                    url: window.location.href,
                    reason: 'no_activity',
                    inactiveTime: timeSinceActivity
                });
                this.flush();
            }
        }, 60000); // Verificar a cada minuto
    }
    
    setupEventListeners() {
        // Track clicks
        if (this.config.trackClicks) {
            document.addEventListener('click', (e) => {
                this.trackClick(e);
                // Também verificar se é um redirecionamento
                this.checkForRedirect(e);
            });
        }
        
        // Track scrolling
        if (this.config.trackScrolls) {
            let scrollTimeout;
            window.addEventListener('scroll', () => {
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    this.trackScroll();
                }, 100);
            });
        }
        
        // Track form inputs
        if (this.config.trackFormInputs) {
            document.addEventListener('input', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    this.trackFormInput(e);
                }
            });
        }
        
        // Interceptar mudanças de URL (para SPAs)
        this.interceptUrlChanges();
        
        // Track visibility changes
        document.addEventListener('visibilitychange', () => {
            this.trackEvent('visibility_change', {
                hidden: document.hidden,
                visibilityState: document.visibilityState
            });
        });
        
        // Track window focus/blur
        window.addEventListener('focus', () => {
            this.trackEvent('window_focus');
        });
        
        window.addEventListener('blur', () => {
            this.trackEvent('window_blur');
        });
        
        // Interceptar window.open e redirecionamentos
        this.interceptWindowOpen();
    }
    
    trackClick(event) {
        const element = event.target;
        
        // Capturar mais detalhes do elemento clicado
        const elementInfo = this.getElementDetails(element);
        
        const data = {
            ...elementInfo,
            clickPosition: {
                x: event.clientX,
                y: event.clientY,
                pageX: event.pageX,
                pageY: event.pageY
            },
            elementSize: {
                width: element.offsetWidth,
                height: element.offsetHeight
            },
            elementPosition: {
                top: element.offsetTop,
                left: element.offsetLeft
            },
            timestamp: Date.now(),
            url: window.location.href
        };
        
        // Se é um link, capturar detalhes do redirecionamento
        if (element.tagName === 'A' || element.closest('a')) {
            const link = element.tagName === 'A' ? element : element.closest('a');
            data.redirect = {
                href: link.href,
                target: link.target || '_self',
                isExternal: !link.href.startsWith(window.location.origin),
                protocol: new URL(link.href).protocol,
                domain: new URL(link.href).hostname
            };
        }
        
        this.trackEvent('click', data);
    }
    
    getElementDetails(element) {
        // Função para capturar todos os detalhes possíveis do elemento
        const details = {
            tagName: element.tagName,
            id: element.id || null,
            className: element.className || null,
            text: element.textContent?.substring(0, 200) || null,
            innerHTML: element.innerHTML?.substring(0, 300) || null,
            href: element.href || null,
            src: element.src || null,
            type: element.type || null,
            name: element.name || null,
            value: element.value || null,
            placeholder: element.placeholder || null,
            title: element.title || null,
            alt: element.alt || null
        };
        
        // Capturar atributos data-*
        const dataAttributes = {};
        for (let attr of element.attributes) {
            if (attr.name.startsWith('data-')) {
                dataAttributes[attr.name] = attr.value;
            }
        }
        if (Object.keys(dataAttributes).length > 0) {
            details.dataAttributes = dataAttributes;
        }
        
        // Capturar hierarquia do elemento (pais)
        const hierarchy = [];
        let parent = element.parentElement;
        let level = 0;
        while (parent && level < 5) {
            hierarchy.push({
                tagName: parent.tagName,
                id: parent.id || null,
                className: parent.className || null
            });
            parent = parent.parentElement;
            level++;
        }
        details.hierarchy = hierarchy;
        
        return details;
    }
    
    trackScroll() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        
        this.scrollDepth = Math.round((scrollTop + windowHeight) / documentHeight * 100);
        this.maxScrollDepth = Math.max(this.maxScrollDepth, this.scrollDepth);
        
        this.trackEvent('scroll', {
            scrollTop: scrollTop,
            scrollDepth: this.scrollDepth,
            maxScrollDepth: this.maxScrollDepth,
            windowHeight: windowHeight,
            documentHeight: documentHeight
        });
    }
    
    trackFormInput(event) {
        const element = event.target;
        const data = {
            tagName: element.tagName,
            type: element.type,
            id: element.id || null,
            name: element.name || null,
            placeholder: element.placeholder || null,
            valueLength: element.value ? element.value.length : 0,
            // Não salvamos o valor real por segurança
            hasValue: !!element.value
        };
        
        this.trackEvent('form_input', data);
    }
    
    checkForRedirect(event) {
        const element = event.target;
        let redirectUrl = null;
        let redirectType = 'unknown';
        
        // Verificar se é um link <a>
        if (element.tagName === 'A' && element.href) {
            redirectUrl = element.href;
            redirectType = 'link';
        }
        // Verificar se está dentro de um link
        else if (element.closest('a')) {
            const link = element.closest('a');
            if (link.href) {
                redirectUrl = link.href;
                redirectType = 'nested_link';
            }
        }
        // Verificar se tem onclick que pode redirecionar
        else if (element.onclick || element.getAttribute('onclick')) {
            const onclickStr = element.getAttribute('onclick') || element.onclick.toString();
            
            // Procurar por padrões de redirecionamento
            const urlPatterns = [
                /window\.location\.href\s*=\s*['"`]([^'"`]+)['"`]/,
                /window\.location\s*=\s*['"`]([^'"`]+)['"`]/,
                /location\.href\s*=\s*['"`]([^'"`]+)['"`]/,
                /window\.open\s*\(\s*['"`]([^'"`]+)['"`]/,
                /https?:\/\/[^\s'"`]+/g
            ];
            
            for (let pattern of urlPatterns) {
                const match = onclickStr.match(pattern);
                if (match) {
                    redirectUrl = match[1] || match[0];
                    redirectType = 'onclick';
                    break;
                }
            }
        }
        
        // Verificar atributos data-* que podem conter URLs
        const dataAttrs = ['data-href', 'data-url', 'data-link', 'data-redirect'];
        for (let attr of dataAttrs) {
            const value = element.getAttribute(attr);
            if (value && (value.startsWith('http') || value.startsWith('/'))) {
                redirectUrl = value;
                redirectType = 'data_attribute';
                break;
            }
        }
        
        if (redirectUrl) {
            this.trackRedirect(event, redirectUrl, redirectType);
        }
    }
    
    trackRedirect(event, customUrl = null, redirectType = 'link') {
        const element = event.target;
        let targetUrl = customUrl;
        
        // Se não foi fornecida URL customizada, tentar extrair do elemento
        if (!targetUrl) {
            if (element.tagName === 'A' && element.href) {
                targetUrl = element.href;
            } else if (element.closest('a')) {
                const link = element.closest('a');
                targetUrl = link.href;
            }
        }
        
        if (!targetUrl) return;
        
        try {
            const url = new URL(targetUrl, window.location.origin);
            const data = {
                originalHref: targetUrl,
                cleanUrl: url.origin + url.pathname,
                queryParams: Object.fromEntries(url.searchParams.entries()),
                text: element.textContent?.substring(0, 200) || null,
                target: element.target || '_self',
                isExternal: !targetUrl.startsWith(window.location.origin),
                protocol: url.protocol,
                domain: url.hostname,
                port: url.port || null,
                pathname: url.pathname,
                hash: url.hash || null,
                redirectType: redirectType,
                elementDetails: this.getElementDetails(element),
                clickTime: Date.now(),
                fromUrl: window.location.href,
                userAgent: navigator.userAgent
            };
            
            // Detectar se é redirecionamento para pagamento/checkout
            const paymentKeywords = ['pay', 'payment', 'checkout', 'compra', 'pagamento', 'pagar', 'concluir-resgate'];
            data.isPotentialPayment = paymentKeywords.some(keyword => 
                targetUrl.toLowerCase().includes(keyword) || 
                element.textContent.toLowerCase().includes(keyword)
            );
            
            this.trackEvent('redirect', data);
            
            // Enviar imediatamente para garantir que seja capturado antes do redirecionamento
            this.flush();
            
            console.log('🔗 Redirecionamento detectado:', targetUrl);
        } catch (error) {
            console.error('Erro ao processar URL de redirecionamento:', error);
        }
    }
    
    interceptUrlChanges() {
        // Interceptar mudanças de URL via History API
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(...args) {
            originalPushState.apply(history, args);
            window.tracker?.trackEvent('url_change', {
                type: 'pushState',
                url: window.location.href,
                state: args[0]
            });
        };
        
        history.replaceState = function(...args) {
            originalReplaceState.apply(history, args);
            window.tracker?.trackEvent('url_change', {
                type: 'replaceState',
                url: window.location.href,
                state: args[0]
            });
        };
        
        // Interceptar popstate (botão voltar/avançar)
        window.addEventListener('popstate', (event) => {
            this.trackEvent('url_change', {
                type: 'popstate',
                url: window.location.href,
                state: event.state
            });
        });
    }
    
    interceptWindowOpen() {
        // Interceptar window.open
        const originalOpen = window.open;
        window.open = function(url, name, specs) {
            if (window.tracker) {
                window.tracker.trackEvent('window_open', {
                    url: url,
                    windowName: name,
                    specs: specs,
                    fromUrl: window.location.href,
                    timestamp: Date.now()
                });
                console.log('🪟 Window.open detectado:', url);
            }
            return originalOpen.call(window, url, name, specs);
        };
        
        // Interceptar location.href changes
        let currentUrl = window.location.href;
        const checkUrlChange = () => {
            if (window.location.href !== currentUrl) {
                this.trackEvent('location_change', {
                    fromUrl: currentUrl,
                    toUrl: window.location.href,
                    timestamp: Date.now()
                });
                currentUrl = window.location.href;
            }
        };
        
        // Verificar mudanças de URL a cada 500ms
        setInterval(checkUrlChange, 500);
    }
    
    trackEvent(eventType, data = {}) {
        if (!this.isTracking) return;
        
        // Atualizar última atividade no localStorage
        localStorage.setItem('userTracker_lastActivity', Date.now().toString());
        
        const event = {
            sessionId: this.config.sessionId,
            eventType: eventType,
            url: window.location.href,
            timestamp: Date.now(),
            data: {
                ...data,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                screen: {
                    width: screen.width,
                    height: screen.height
                }
            }
        };
        
        this.eventQueue.push(event);
        
        // Auto flush if queue is full
        if (this.eventQueue.length >= this.config.batchSize) {
            this.flush();
        }
    }
    
    flush() {
        if (this.eventQueue.length === 0) return;
        
        const events = [...this.eventQueue];
        this.eventQueue = [];
        
        // Send events to server
        this.sendEvents(events);
    }
    
    sendEvents(events) {
        const payload = {
            events: events,
            sessionId: this.config.sessionId,
            url: window.location.href,
            eventType: 'batch',
            batchInfo: {
                batchSize: events.length,
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                referrer: document.referrer,
                pageTitle: document.title
            }
        };
        
        // Use sendBeacon if available (better for page unload)
        if (navigator.sendBeacon) {
            const success = navigator.sendBeacon(this.config.endpoint, JSON.stringify(payload));
            if (!success) {
                // Fallback to fetch if sendBeacon fails
                this.sendWithFetch(payload);
            }
        } else {
            this.sendWithFetch(payload);
        }
    }
    
    sendWithFetch(payload) {
        fetch(this.config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            keepalive: true // Importante para requests durante unload
        }).then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('Network response was not ok');
        }).then(data => {
            if (data.onlineUsers) {
                // Atualizar contador de usuários online se disponível
                this.updateOnlineCounter(data.onlineUsers);
            }
        }).catch(error => {
            console.error('Tracking error:', error);
        });
    }
    
    updateOnlineCounter(count) {
        // Criar ou atualizar contador de usuários online
        let counter = document.getElementById('online-users-counter');
        if (!counter) {
            counter = document.createElement('div');
            counter.id = 'online-users-counter';
            counter.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: #007cba;
                color: white;
                padding: 8px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: bold;
                z-index: 9999;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            `;
            document.body.appendChild(counter);
        }
        counter.textContent = `👥 ${count} online`;
    }
    
    // Métodos públicos para tracking customizado
    track(eventType, data = {}) {
        this.trackEvent(eventType, data);
    }
    
    trackCustom(eventName, properties = {}) {
        this.trackEvent('custom', {
            eventName: eventName,
            properties: properties
        });
    }
    
    stop() {
        this.isTracking = false;
        this.flush();
    }
    
    start() {
        this.isTracking = true;
    }
}

// Auto-initialize if not in module environment
if (typeof module === 'undefined') {
    window.UserTracker = UserTracker;
    
    // NÃO auto-inicializar aqui - deixar para o código customizado
    console.log('📦 UserTracker class loaded, waiting for manual initialization');
}