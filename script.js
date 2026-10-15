document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('riskForm');
    const welcomePanel = document.getElementById('welcomePanel');
    const resultCard = document.getElementById('resultCard');
    const riskBanner = document.getElementById('riskBanner');
    const resultContent = document.getElementById('resultContent');
    const loadingDiv = document.getElementById('loading');
    const submitBtn = document.getElementById('submitBtn');
    const cityNameInput = document.getElementById('cityName');
    const geoBtn = document.getElementById('geoBtn');
    const printBtn = document.getElementById('printBtn');
    const printShortcutBtn = document.getElementById('printShortcutBtn');
    const favoritesContainer = document.getElementById('favoritesContainer');
    const favButtons = document.getElementById('favButtons');
    const newsContent = document.getElementById('newsContent');
    const hourlyRiskContent = document.getElementById('hourlyRiskContent');
    const liveEmergencyStatus = document.getElementById('liveEmergencyStatus');

    // Kısayol Butonları ve Modallar
    const shortcutBtns = document.querySelectorAll('.shortcut-btn');
    const openIlkYardimModal = document.getElementById('openIlkYardimModal');
    const closeIlkYardimModal = document.getElementById('closeIlkYardimModal');
    const ilkYardimModal = document.getElementById('ilkYardimModal');

    const openBultenModal = document.getElementById('openBultenModal');
    const closeBultenModal = document.getElementById('closeBultenModal');
    const bultenModal = document.getElementById('bultenModal');

    let tempChartInstance = null;
    let envChartInstance = null;

    loadFavorites();
    loadMeteorologyNews();

    // --- Modal Açma / Kapatma Kontrolleri ---
    openIlkYardimModal.addEventListener('click', () => {
        shortcutBtns.forEach(b => b.classList.remove('active'));
        openIlkYardimModal.classList.add('active');
        ilkYardimModal.classList.remove('hidden');
    });

    closeIlkYardimModal.addEventListener('click', () => {
        ilkYardimModal.classList.add('hidden');
    });

    openBultenModal.addEventListener('click', () => {
        shortcutBtns.forEach(b => b.classList.remove('active'));
        openBultenModal.classList.add('active');
        bultenModal.classList.remove('hidden');
    });

    closeBultenModal.addEventListener('click', () => {
        bultenModal.classList.add('hidden');
    });

    window.addEventListener('click', (e) => {
        if (e.target === ilkYardimModal) ilkYardimModal.classList.add('hidden');
        if (e.target === bultenModal) bultenModal.classList.add('hidden');
    });

    document.querySelector('[data-target="analiz"]').addEventListener('click', function() {
        shortcutBtns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('analiz').scrollIntoView({ behavior: 'smooth' });
    });

    printShortcutBtn.addEventListener('click', () => {
        window.print();
    });

    function stopLoading() {
        loadingDiv.classList.add('hidden');
        submitBtn.disabled = false;
        geoBtn.disabled = false;
    }

    geoBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("Tarayıcınız konum servislerini desteklemiyor.");
            return;
        }

        loadingDiv.classList.remove('hidden');
        welcomePanel.classList.add('hidden');
        geoBtn.disabled = true;

        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=tr`);
                const data = await res.json();
                
                const city = data.address.city || data.address.town || data.address.province || "Konumum";
                cityNameInput.value = city;
                
                await fetchWeatherDataByCoords(lat, lon, city);
            } catch (err) {
                await fetchWeatherDataByCoords(lat, lon, "Mevcut Konum");
            }
        }, (error) => {
            stopLoading();
            alert("Konum izni alınamadı veya reddedildi.");
        }, { timeout: 10000 });
    });

    printBtn.addEventListener('click', () => {
        window.print();
    });

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        clearErrors();

        const cityName = cityNameInput.value.trim();
        const profile = document.getElementById('healthProfile').value;

        if (!cityName) {
            showError('cityError', 'cityName', 'Lütfen bir şehir adı giriniz.');
            return;
        }

        loadingDiv.classList.remove('hidden');
        welcomePanel.classList.add('hidden');
        resultCard.classList.add('hidden');
        submitBtn.disabled = true;

        try {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=tr&format=json`);
            const geoData = await geoRes.json();

            if (!geoData.results || geoData.results.length === 0) {
                throw new Error("Şehir bulunamadı. Lütfen geçerli bir şehir adı yazın.");
            }

            const location = geoData.results[0];
            await fetchWeatherDataByCoords(location.latitude, location.longitude, `${location.name} (${location.country || 'Türkiye'})`, profile);

        } catch (error) {
            showError('cityError', 'cityName', error.message || "Veriler alınırken bir hata oluştu.");
            welcomePanel.classList.remove('hidden');
            resultCard.classList.add('hidden');
            stopLoading();
        }
    });

    async function fetchWeatherDataByCoords(lat, lon, officialName, profile = 'general') {
        try {
            saveFavorite(officialName.split('(')[0].trim());

            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,uv_index`;
            const airUrl = `https://api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5`;

            const [weatherRes, airRes] = await Promise.all([
                fetch(weatherUrl),
                fetch(airUrl)
            ]);

            const weatherData = await weatherRes.json();
            const airData = await airRes.json();

            const current = weatherData.current;
            let currentPm25 = (airData.current && airData.current.pm2_5 !== undefined) ? airData.current.pm2_5 : null;

            calculateAndShowAdvancedRisk(officialName, current.temperature_2m, current.apparent_temperature, current.relative_humidity_2m, currentPm25, profile, weatherData.hourly);

        } catch (err) {
            alert("Hava durumu verileri yüklenirken ağ hatası oluştu.");
            welcomePanel.classList.remove('hidden');
        } finally {
            stopLoading();
        }
    }

    function saveFavorite(city) {
        let favs = JSON.parse(localStorage.getItem('iklim_favs')) || [];
        if (!favs.includes(city)) {
            favs.unshift(city);
            if (favs.length > 4) favs.pop();
            localStorage.setItem('iklim_favs', JSON.stringify(favs));
        }
        loadFavorites();
    }

    function loadFavorites() {
        let favs = JSON.parse(localStorage.getItem('iklim_favs')) || [];
        if (favs.length > 0) {
            favoritesContainer.classList.remove('hidden');
            favButtons.innerHTML = favs.map(city => `<button type="button" class="fav-btn" data-city="${city}">${city}</button>`).join('');
            
            document.querySelectorAll('.fav-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    cityNameInput.value = btn.getAttribute('data-city');
                    form.dispatchEvent(new Event('submit'));
                });
            });
        } else {
            favoritesContainer.classList.add('hidden');
        }
    }

    function calculateAndShowAdvancedRisk(city, temp, apparentTemp, humidity, pm25, profile, hourlyData) {
        let riskScore = 0;
        let reasons = [];

        let tempThresholdHigh = 38;
        let tempThresholdMed = 32;
        let pmThresholdHigh = 55;

        if (profile === 'sensitive' || profile === 'asthma') {
            tempThresholdHigh = 34;
            tempThresholdMed = 28;
            pmThresholdHigh = 35;
        }

        if (temp >= tempThresholdHigh || apparentTemp >= tempThresholdHigh + 2) {
            riskScore += 3;
            reasons.push(`Aşırı sıcaklık (${apparentTemp}°C hissedilen) seçilen profiliniz için risklidir.`);
        } else if (temp >= tempThresholdMed) {
            riskScore += 2;
            reasons.push(`Yüksek sıcaklık (${temp}°C) vücut direncini zorlayabilir.`);
        } else {
            reasons.push(`Sıcaklık seviyesi (${temp}°C) normal sınırlardadır.`);
        }

        if (temp >= 26 && humidity >= 70) {
            riskScore += 2;
            reasons.push(`Yüksek nem (%${humidity}) terin buharlaşmasını engeller.`);
        }

        if (pm25 !== null) {
            if (pm25 > pmThresholdHigh) {
                riskScore += 3;
                reasons.push(`PM2.5 kirliliği (${pm25} µg/m³) yüksektir.`);
            } else if (pm25 > 20) {
                riskScore += 1;
                reasons.push(`PM2.5 kirliliği (${pm25} µg/m³) orta düzeydedir.`);
            }
        }

        let riskLevel = "", riskClass = "", recommendations = [];
        if (riskScore >= 4) {
            riskLevel = "Yüksek Risk";
            riskClass = "badge-high";
            recommendations = [
                "Günün en sıcak saatlerinde dışarı çıkmayın.",
                "Bol sıvı tüketin, serin alanlarda kalın.",
                profile === 'asthma' ? "Astım ilacınızı yanınızda bulundurun." : "Ağır fiziksel aktivitelerden kaçının."
            ];
            liveEmergencyStatus.className = "live-status-box danger";
            liveEmergencyStatus.innerHTML = `🔴 <strong>ACİL DURUM UYARISI (${city}):</strong> Yüksek risk tespit edildi! İlk yardım tedbirlerini inceleyin.`;
        } else {
            let isMedium = riskScore >= 2;
            riskLevel = isMedium ? "Orta Risk" : "Düşük Risk";
            riskClass = isMedium ? "badge-medium" : "badge-low";
            
            recommendations = isMedium ? [
                "Açık havada süreyi kısıtlayın.",
                "Gölge alanları tercih edin, su için."
            ] : [
                "Hava koşulları açık hava aktiviteleri için uygundur.",
                "Günlük su tüketiminizi ihmal etmeyin."
            ];

            liveEmergencyStatus.className = isMedium ? "live-status-box warning" : "live-status-box normal";
            liveEmergencyStatus.innerHTML = isMedium 
                ? `🟡 <strong>Orta Seviye Uyarı (${city}):</strong> Hassas gruplar dikkatli olmalıdır.`
                : `🟢 <strong>Güvenli Koşullar (${city}):</strong> Acil çevresel sağlık riski bulunmuyor.`;
        }

        let profileNames = {
            'general': 'Genel Yetişkin',
            'sensitive': 'Yaşlı / Çocuk',
            'asthma': 'Astım / Solunum',
            'athlete': 'Sporcu / Aktif'
        };

        riskBanner.className = `risk-banner ${riskClass}`;
        riskBanner.innerHTML = `⚠️ Risk Seviyesi: ${riskLevel}`;

        resultContent.innerHTML = `
            <div class="result-box-section">
                <h4>📍 Konum ve Özet</h4>
                <p><strong>Konum:</strong> ${escapeHtml(city)}</p>
                <p><strong>Profil:</strong> ${profileNames[profile]}</p>
                <p style="margin-top: 4px;"><strong>Ölçüm:</strong> ${temp}°C (Hissedilen: ${apparentTemp}°C) | Nem: %${humidity}</p>
            </div>
            <div class="result-box-section">
                <h4>🔍 Risk Nedenleri</h4>
                <ul>
                    ${reasons.map(r => `<li>${r}</li>`).join('')}
                </ul>
            </div>
            <div class="result-box-section" style="grid-column: span 2;">
                <h4>🛡️ Korunma Önerileri</h4>
                <ul style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 2px;">
                    ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        `;

        welcomePanel.classList.add('hidden');
        resultCard.classList.remove('hidden');

        renderHourlyRiskWindows(hourlyData);
        renderMultiCharts(hourlyData);

        // --- n8n Webhook Bildirim Tetikleyicisi ---
        fetch('https://nidatmz.app.n8n.cloud/webhook/sicaklik-uyari', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                city: city,
                temp: temp,
                apparentTemp: apparentTemp,
                humidity: humidity,
                riskLevel: riskLevel,
                profile: profileNames[profile] || profile
            })
        }).then(res => console.log("n8n e-posta tetiklendi."))
          .catch(err => console.log("n8n tetikleme hatası:", err));
    }

    function renderHourlyRiskWindows(hourlyData) {
        const temps = hourlyData.temperature_2m.slice(0, 24);
        const uvIndexes = hourlyData.uv_index ? hourlyData.uv_index.slice(0, 24) : Array(24).fill(2);

        let windows = [
            { label: "Sabah (09-12)", start: 9, end: 12 },
            { label: "Öğle Pik (12-16)", start: 12, end: 16 },
            { label: "Akşamüstü (16-20)", start: 16, end: 20 }
        ];

        let html = "";
        windows.forEach(win => {
            let sliceTemps = temps.slice(win.start, win.end);
            let sliceUvs = uvIndexes.slice(win.start, win.end);
            
            let avgTemp = sliceTemps.length ? (sliceTemps.reduce((a,b)=>a+b,0)/sliceTemps.length).toFixed(1) : "-";
            let maxUv = sliceUvs.length ? Math.max(...sliceUvs).toFixed(1) : "-";
            
            let isDangerous = avgTemp >= 32 || maxUv >= 6;

            html += `
                <div class="hourly-card ${isDangerous ? 'danger' : ''}">
                    <div class="hourly-time">${win.label}</div>
                    <p>Ort: <strong>${avgTemp}°C</strong></p>
                    <p>Maks. UV: <strong>${maxUv}</strong></p>
                </div>
            `;
        });

        hourlyRiskContent.innerHTML = html;
    }

    function renderMultiCharts(hourlyData) {
        const times = hourlyData.time.slice(0, 24).map(t => t.split('T')[1]);
        const temps = hourlyData.temperature_2m.slice(0, 24);
        const apparentTemps = hourlyData.apparent_temperature.slice(0, 24);
        const humidities = hourlyData.relative_humidity_2m.slice(0, 24);
        const uvIndexes = hourlyData.uv_index ? hourlyData.uv_index.slice(0, 24) : Array(24).fill(2);

        const ctxTemp = document.getElementById('tempChart').getContext('2d');
        if (tempChartInstance) tempChartInstance.destroy();

        tempChartInstance = new Chart(ctxTemp, {
            type: 'line',
            data: {
                labels: times,
                datasets: [
                    { label: 'Gerçek (°C)', data: temps, borderColor: '#0284c7', borderWidth: 2, fill: true, backgroundColor: 'rgba(2,132,199,0.05)', tension: 0.3 },
                    { label: 'Hissedilen (°C)', data: apparentTemps, borderColor: '#f59e0b', borderWidth: 2, borderDash: [3,3], tension: 0.3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        const ctxEnv = document.getElementById('envChart').getContext('2d');
        if (envChartInstance) envChartInstance.destroy();

        envChartInstance = new Chart(ctxEnv, {
            type: 'line',
            data: {
                labels: times,
                datasets: [
                    { label: 'Nem (%)', data: humidities, borderColor: '#10b981', borderWidth: 2, fill: true, backgroundColor: 'rgba(16,185,129,0.05)', tension: 0.3 },
                    { label: 'UV', data: uvIndexes, borderColor: '#8b5cf6', borderWidth: 2, tension: 0.3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function loadMeteorologyNews() {
        const mockNews = [
            { title: "Aşırı Sıcak Dalgaları", desc: "11.00 - 16.00 saatleri arasında güneş altında kalmayın." },
            { title: "Hava Kalitesi Takibi", desc: "Yoğun saatlerde partikül madde artışlarına dikkat edin." },
            { title: "UV Işınları Korunması", desc: "Öğle saatlerinde koruyucu gözlük ve krem kullanın." }
        ];

        newsContent.innerHTML = mockNews.map(news => `
            <div class="news-card-item">
                <div class="news-title">${news.title}</div>
                <div class="news-desc">${news.desc}</div>
            </div>
        `).join('');
    }

    function showError(errorId, inputId, message) {
        document.getElementById(errorId).textContent = message;
        document.getElementById(inputId).classList.add('error');
    }

    function clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
        document.querySelectorAll('input').forEach(el => el.classList.remove('error'));
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
});