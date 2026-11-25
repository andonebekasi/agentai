# Tencent Cloud FinOps Reference Guide (`tccli` CLI)

Panduan teknis perintah native `tccli` (Tencent Cloud CLI) untuk audit FinOps, eliminasi pemborosan, rightsizing, dan analisis tagihan cloud.

---

## 1. Autentikasi & Verifikasi Akun

```bash
# Verifikasi konfigurasi tccli
tccli configure list

# Cek region aktif
tccli configure get region
```

---

## 2. Visibilitas Biaya & Tagihan (Billing Service)

```bash
CURRENT_MONTH=$(date +%Y-%m)

# Ringkasan Tagihan Bulanan per Produk
tccli billing DescribeBillSummaryByProduct \
  --BeginMonth "$CURRENT_MONTH"

# Ringkasan Biaya berdasarkan Metode Pembayaran (Prepaid / Postpaid)
tccli billing DescribeBillSummaryByPayMode \
  --BeginMonth "$CURRENT_MONTH"

# Ringkasan Alokasi Biaya (Cost Summary)
tccli billing DescribeCostSummaryByProduct \
  --BeginMonth "$CURRENT_MONTH"

# Rincian Tagihan Detail (Bill Detail)
tccli billing DescribeBillDetail \
  --Offset 0 \
  --Limit 20 \
  --Month "$CURRENT_MONTH"
```

---

## 3. Deteksi Pemborosan (Waste & Orphaned Resources)

### A. Unattached Cloud Block Storage (CBS) Disks
CBS Cloud Disk yang berstatus `UNATTACHED` tetap membebankan biaya per GB-bulan sesuai tipe storage (Cloud SSD, High-Performance Cloud Disk):
```bash
tccli cbs DescribeDisks \
  --Filters '[{"Name":"disk-state","Values":["UNATTACHED"]}]'
```

### B. Unassociated Elastic IP Addresses (EIP Menganggur)
Elastic IP publik yang dialokasikan namun tidak terikat ke CVM atau NAT Gateway (`UNBIND`):
```bash
tccli vpc DescribeAddresses \
  --Filters '[{"Name":"address-status","Values":["UNBIND"]}]'
```

### C. Stopped CVM (Cloud Virtual Machine) Instances
Instance CVM yang berstatus `STOPPED`: Jika bukan model "No charge when stopped", disk CBS yang menempel tetap ditagihkan penuh:
```bash
tccli cvm DescribeInstances \
  --Filters '[{"Name":"instance-state","Values":["STOPPED"]}]'
```

### D. Snapshot CBS Berumur Tua
```bash
tccli cbs DescribeSnapshots \
  --Filters '[{"Name":"snapshot-state","Values":["NORMAL"]}]'
```

---

## 4. Rightsizing & Optimasi Monitor

```bash
# Cek utilisasi CPU/Memory rata-rata CVM via Monitor CLI
tccli monitor GetMonitorData \
  --Namespace "QCE/CVM" \
  --MetricName "CPUUsage" \
  --StartTime "$(date -d '7 days ago' +%Y-%m-%dT00:00:00Z)" \
  --EndTime "$(date +%Y-%m-%dT00:00:00Z)" \
  --Period 86400
```
