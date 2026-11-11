---
title: YZ Vakaları D: Lojistik
---

Bu bölümde 5 vakayı inceliyoruz: soğuk zincir izleme, rota optimizasyonu, gümrük ve tarife, depo envanter sayımı ve depo robot trafiği.

---

## Maersk: Soğuk zincirde konteynerleri uzaktan izleyen dijital asistan

### Problem neydi?

- Soğutmalı konteynerlerde hassas gıda ve ilaç yükleri taşınıyor. Sıcaklık, nem ya da CO2 düzeyi saparsa yük bozulabiliyor.
- Müşteriler yolculuk boyunca yüklerinin durumunu göremiyordu.
- Maersk 2017'de uzaktan konteyner yönetimi (RCM) aracını sunmuştu ama aracın geliştirilmesi gereken yanları vardı.

### Nasıl çözüldü?

- Konteynerlerdeki sensörler sıcaklık, nem ve CO2 verisini sürekli gönderiyor.
- RCM platformuna eklenen sanal asistan Captain Peter bu veriyi izliyor. Bir değer sapınca müşteriyi uyarıyor.
- Veri bulutta tutuluyor, kolayca paylaşılıyor ve her müşteriye göre ayarlanabiliyor. Arayüz bir telefon uygulaması kadar sade.

### Sonuç

- **380.000 soğutmalı konteyner platform kapsamında.**
- 2017'den bu yana 3.600'den fazla şirket RCM'ye kaydoldu.

> **Dersimizden:** Soğuk zincirde risk yönetimi, sorunu varışta değil yolda görmektir.

*Kaynak: Maersk basın duyurusu*

---

## UPS: ORION ile rota optimizasyonu

### Problem neydi?

- UPS'te bir sürücü günde yaklaşık 160 adrese teslimat yapıyor. Bu durakların sıralanabileceği rota sayısı astronomik.
- Rotalar büyük ölçüde sürücünün deneyimine bağlıydı.
- Sürücü başına günde 1 mil tasarruf bile yılda 50 milyon dolar ediyor.

### Nasıl çözüldü?

- ORION müşterilerin teslimat şartlarını 250 milyon adres veri noktası içeren özel haritayla birleştiriyor.
- Algoritma hizmet şartlarını karşılayan en kısa rotayı hesaplıyor.
- 2020'de eklenen Dynamic ORION yol sırasında koşul değişince rotayı anlık yeniden çiziyor.

### Sonuç

- **Yılda 100 milyon mil daha az yol.**
- Yılda 10 milyon galon yakıt, 300–400 milyon $ ve 100.000 ton CO2 tasarrufu.

> **Dersimizden:** Maliyet ve emisyon aynı algoritmadan düşer. Yeşil lojistik kârlı olabilir.

*Kaynak: INFORMS, Transport Topics, Governing*

---

## Maersk: Trade & Tariff Studio ile gümrük ve tarife

### Problem neydi?

- Küresel ticarette tarifeler sık değişiyor ve kurallar karmaşıklaşıyor.
- Bir ürünün yanlış gümrük kodunda sınıflandırılması gecikme, el koyma ve ceza riski doğuruyor.
- Bu riskler çoğu zaman yük sınıra vardığında fark ediliyor.

### Nasıl çözüldü?

- YZ 6.000'i aşkın ürün kodu ve 20.000'i aşkın alt kodda doğru sınıflandırmayı ve vergi etkisini hesaplıyor.
- Gümrük beyanından önce YZ destekli ön inceleme yapılıyor ve uyum riskleri taranıyor.
- Ticaret bilgisi tedarikçi seçimi ve ürün tasarımı gibi erken kararlara taşınıyor. Platform 2.700 gümrük uzmanının ağıyla güncelleniyor.

### Sonuç

- **2025 yılında kuruldu.**
- 2026'da beyan sonrası denetime hazırlığı da kapsayacak şekilde genişletildi.

> **Dersimizden:** Gümrük maliyeti tedarikçi seçerken hesaplanmalı. Sınırda fark edilen maliyet TCO'yu olumsuz etkiler.

*Kaynak: FreightWaves, Container News, New Telegraph*

---

## Maersk: Otonom robot ve YZ ile depo envanter sayımı

*Çözüm sağlayıcı: Dexory*

### Problem neydi?

- Depolarda döngüsel sayımlar tekrarlı ve emek yoğundu.
- Stok kayıtları ile raftaki gerçek durum arasında tutarsızlıklar oluşuyordu.
- Müşteriler stoklarına anlık görünürlük istiyordu.

### Nasıl çözüldü?

- İngiltere'deki Kettering ve Tamworth depolarında otonom robotlar ürünleri ölçüyor, izliyor ve konumlandırıyor.
- YZ bu veriyi depo yönetim sistemindeki (WMS) kayıtlarla karşılaştırıyor ve tutarsızlıkları işaretliyor.
- Bükreş dağıtım merkezinde robot 100.000'den fazla palet lokasyonunu her gün tarıyor.

### Sonuç

- **Birkaç haftada %100 envanter doğruluğuna ulaşıldı.**
- Haftada 40 saati aşan sayım işi otomatikleşti.

> **Dersimizden:** Depoda doğru envanter, satın almada doğru sipariş demektir.

*Kaynak: Dexory vaka çalışması, DC Velocity*

---

## Amazon: DeepFleet ile depo robotu trafiği

### Problem neydi?

- Amazon'un depolarında 1 milyonu aşan robot raf, paket ve ürün taşıyor.
- Bu kadar robotun aynı alanda hareket etmesi trafik sıkışıklığı ve gereksiz yol yaratıyordu.

### Nasıl çözüldü?

- Amazon kendi depolarındaki envanter hareket verisiyle DeepFleet adlı üretken YZ temel modelini eğitti.
- Model bir şehir trafik yönetim sistemi gibi çalışıyor. Robotların en uygun yolu bulmasını ve darboğazların azalmasını sağlıyor.
- Daha akıcı trafik sayesinde ürünler müşteriye daha yakın depolanabiliyor. Model veriyle öğrenmeye devam ediyor.

### Sonuç

- **Robot seyahat süresi %10 kısaldı.**
- Yeni nesil tesiste bakım ve mühendislik rollerinde %30 daha fazla çalışan gerekiyor.

> **Dersimizden:** Otomasyon işi ortadan kaldırmaz, işin niteliğini değiştirir.

*Kaynak: Amazon, Digital Commerce 360*
