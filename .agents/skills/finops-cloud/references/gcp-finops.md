# GCP FinOps Reference Guide (`gcloud` CLI)

Panduan teknis perintah native `gcloud` CLI untuk audit FinOps, eliminasi pemborosan, rightsizing, dan analisis komitmen diskon di Google Cloud Platform.

---

## 1. Autentikasi & Verifikasi Project

```bash
# Cek akun aktif & project ID
gcloud auth list
gcloud config get-value project

# List projects yang dapat diakses
gcloud projects list --format="table(projectId,name,projectNumber)"
```

---

## 2. Visibilitas Biaya & Billing

```bash
# Lihat daftar Billing Account yang terhubung
gcloud billing accounts list --format="table(name,displayName,open)"

# Cek apakah project memiliki billing account aktif
PROJECT_ID=$(gcloud config get-value project)
gcloud billing projects describe "$PROJECT_ID"

# Daftar budget alerts yang terpasang pada billing account
BILLING_ID="<YOUR_BILLING_ACCOUNT_ID>"
gcloud billing budgets list --billing-account="$BILLING_ID" --format=table
```

---

## 3. Deteksi Pemborosan (Waste Detection)

### A. Unattached Persistent Disks (Disk Tanpa VM)
Persistent Disk yang tidak ter-attach ke instance mana pun tetap ditagih penuh per GB/bulan:
```bash
gcloud compute disks list \
  --filter="-users:*" \
  --format="table(name,sizeGb,type.basename(),zone.basename(),status,creationTimestamp)"
```

### B. Unused Static External IP Addresses (Reserved Menganggur)
Google Cloud mengenakan biaya per jam untuk IP statis eksternal yang di-reserve tapi tidak diasosiasikan ke VM atau Load Balancer aktif:
```bash
gcloud compute addresses list \
  --filter="status=RESERVED" \
  --format="table(name,address,region.basename(),status)"
```

### C. Stopped / Terminated Instances
VM yang berstatus `TERMINATED` tidak memakan vCPU/RAM, tetapi Persistent Disk (Boot Disk & Data Disk) yang menempel tetap ditagihkan biaya storage:
```bash
gcloud compute instances list \
  --filter="status=TERMINATED" \
  --format="table(name,zone.basename(),machineType.basename(),disks[0].diskSizeGb:label=BOOT_GB,status)"
```

### D. Snapshot Disk Berumur Tua
```bash
gcloud compute snapshots list \
  --sort-by=~creationTimestamp \
  --format="table(name,diskSizeGb,storageBytes,creationTimestamp,sourceDisk.basename())"
```

---

## 4. Google Cloud Recommender API (Rightsizing & Idle VM)

GCP Recommender secara otomatis menganalisis penggunaan resource dan memberikan rekomendasi penghematan:

```bash
PROJECT_ID=$(gcloud config get-value project)
ZONE="asia-southeast1-a"  # Sesuaikan zone

# 1. Rekomendasi Idle VM (VM yang tidak ada traffic/utilization)
gcloud recommender recommendations list \
  --project="$PROJECT_ID" \
  --location="$ZONE" \
  --recommender=google.compute.instance.IdleResourceRecommender \
  --format=json

# 2. Rekomendasi Rightsizing Machine Type (Downsize vCPU/RAM)
gcloud recommender recommendations list \
  --project="$PROJECT_ID" \
  --location="$ZONE" \
  --recommender=google.compute.instance.MachineTypeRecommender \
  --format="table(content.overview.resource,content.overview.recommendedAction,primaryImpact.costProjection.cost.units:label=SAVING_USD)"

# 3. Rekomendasi Idle Persistent Disk
gcloud recommender recommendations list \
  --project="$PROJECT_ID" \
  --location="$ZONE" \
  --recommender=google.compute.disk.IdleResourceRecommender \
  --format=table

# 4. Rekomendasi Committed Use Discounts (CUD)
gcloud recommender recommendations list \
  --project="$PROJECT_ID" \
  --location="$ZONE" \
  --recommender=google.compute.commitment.UsageCommitmentRecommender \
  --format=table
```
