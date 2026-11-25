# Azure FinOps Reference Guide (`az` CLI)

Panduan teknis perintah native `az` (Azure CLI) untuk audit FinOps, eliminasi pemborosan, rightsizing, dan analisis diskon reservasi.

---

## 1. Autentikasi & Verifikasi Subscription

```bash
# Cek akun & subscription aktif
az account show --output table

# List semua subscription yang dapat diakses
az account list --output table
```

---

## 2. Visibilitas Biaya & Tagihan (Cost Management & Consumption)

```bash
# Query biaya bulan berjalan (Month-to-Date)
az costmanagement query \
  --type Usage \
  --timeframe MonthToDate \
  --dataset-aggregation '{"totalCost":{"name":"PreTaxCost","function":"Sum"}}' \
  --output table

# Cek daftar budgets yang telah dikonfigurasi
az consumption budget list --output table

# Cek tagihan konsumsi detail per resource
az consumption usage list --top 20 --output table
```

---

## 3. Deteksi Pemborosan (Waste & Orphaned Resources)

### A. Unattached Managed Disks (Disk Tanpa VM)
Managed Disk yang berstatus tidak terpasang (`managedBy == null`) tetap membebankan biaya storage per bulan sesuai ukuran dan jenis (Standard HDD, Standard SSD, Premium SSD):
```bash
az disk list \
  --query "[?managedBy==null].{Name:name,SizeGB:diskSizeGb,Sku:sku.name,ResourceGroup:resourceGroup,TimeCreated:timeCreated}" \
  --output table
```

### B. Unassociated Public IP Addresses
Public IP statis atau dinamis yang tidak diasosiasikan ke Network Interface (NIC) atau Gateway:
```bash
az network public-ip list \
  --query "[?ipConfiguration==null].{Name:name,IP:ipAddress,Allocation:publicIpAllocationMethod,ResourceGroup:resourceGroup}" \
  --output table
```

### C. Unattached Network Interfaces (NIC Menganggur)
NIC yang tersisa setelah penghapusan VM (seringkali masih mengikat Public IP berbayar):
```bash
az network nic list \
  --query "[?virtualMachine==null].{Name:name,ResourceGroup:resourceGroup,EnableIPForwarding:enableIPForwarding}" \
  --output table
```

### D. VM Deallocated (Stopped tapi Disk Tetap Bayar)
Virtual Machine dengan status `VM deallocated` tidak ditagih compute, namun OS disk & Data disk tetap ditagih penuh:
```bash
az vm list -d \
  --query "[?powerState=='VM deallocated'].{Name:name,Size:hardwareProfile.vmSize,ResourceGroup:resourceGroup}" \
  --output table
```

---

## 4. Azure Advisor Cost Recommendations

Azure Advisor memberikan rekomendasi penghematan otomatis berdasarkan pola utilisasi:

```bash
# Ambil rekomendasi kategori Cost
az advisor recommendation list \
  --category Cost \
  --query "[].{Impact:impact,Problem:shortDescription.problem,Solution:shortDescription.solution,Resource:resourceMetadata.resourceId}" \
  --output table
```

---

## 5. Komitmen Diskon (Azure Reservations)

```bash
# Cek Reservasi yang aktif
az reservations reservation list --output table

# Rekomendasi pembelian Reservasi untuk VM
az consumption reservation-recommendation list --output table
```
