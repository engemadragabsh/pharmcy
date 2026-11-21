/**
 * كتالوج المركبات الدوائية — الجزء الثالث
 * مكملات وفيتامينات، أدوية حديثة (GLP-1)، حقن ومحاليل وريدية،
 * مركبات إضافية مؤكدة
 */
export const MOLECULES_C = [
  // ═══════════ مكملات وفيتامينات ═══════════
  ["فيتامين د3", "Vitamin D3", "supp", [["50000 وحدة", "CAP"], ["400 وحدة/مل", "DROPS"]]],
  ["فيتامين ب مركب", "Vitamin B-Complex", "supp", [["أقراص", "TABF"]]],
  ["فيتامين ب12", "Vitamin B12 (Cyanocobalamin)", "supp", [["1000 مكجم", "TABF"]]],
  ["فيتامين ب1", "Vitamin B1 (Thiamine)", "supp", [["100 مجم", "TABF"]]],
  ["فيتامين ب6", "Vitamin B6 (Pyridoxine)", "supp", [["100 مجم", "TABF"]]],
  ["فيتامين هـ", "Vitamin E", "supp", [["400 وحدة", "CAP"]]],
  ["حمض الفوليك", "Folic Acid", "supp", [["5 مجم", "TABF"]]],
  ["كالسيوم + فيتامين د3", "Calcium + Vitamin D3", "supp", [["600 مجم/200 وحدة", "TABF"]]],
  ["المغنيسيوم", "Magnesium", "supp", [["400 مجم", "TABF"]]],
  ["الزنك", "Zinc", "supp", [["50 مجم", "TABF"]]],
  ["أوميغا 3", "Omega-3", "supp", [["1000 مجم", "CAP"]]],
  ["كولاجين + فيتامين سي", "Collagen + Vitamin C", "supp", [["مسحوق 300 جم", "SACH"]]],
  ["بيوتين", "Biotin", "supp", [["5000 مكجم", "TABF"]]],
  ["ملتي فيتامين أطفال", "Kids Multivitamin", "supp", [["شراب", "SYR"]]],
  ["حديد + فيتامين سي", "Iron + Vitamin C", "supp", [["أقراص", "TABF"]]],
  ["حديد بولي مالتوز", "Iron Polymaltose", "supp", [["شراب", "SYR"]]],
  ["جلوكوزامين", "Glucosamine", "supp", [["500 مجم", "TABF"]]],
  ["كوينزيم Q10", "Coenzyme Q10", "supp", [["100 مجم", "CAP"]]],
  ["لوتين + زياكسانثين", "Lutein + Zeaxanthin", "supp", [["10 مجم", "CAP"]]],
  ["بروبيوتيك", "Probiotics", "supp", [["أكياس", "SACH"]]],
  ["ميلاتونين", "Melatonin", "supp", [["3 مجم", "TABF"]]],
  ["خميرة البيرة", "Brewer's Yeast", "supp", [["أقراص", "TABF"]]],
  ["بروتين مصل اللبن", "Whey Protein", "supp", [["2 كجم", "NONE"]]],

  // ═══════════ أدوية حديثة ═══════════
  ["سيماغلوتيد أقراص", "Semaglutide Tablets", "dm-glp", [["3 مجم", "TABF"], ["7 مجم", "TABF"], ["14 مجم", "TABF"]]],
  ["سيماغلوتيد حقن", "Semaglutide Injection", "dm-glp", [["1 مجم/0.75 مل", "PEN"]]],
  ["أورليستات", "Orlistat", "misc2", [["120 مجم", "CAP"]]],

  // ═══════════ قلب وضغط إضافية ═══════════
  ["أميودارون", "Amiodarone", "cardio", [["200 مجم", "TABF"], ["150 مجم/3 مل", "INJ"]]],
  ["نيكورانديل", "Nicorandil", "cardio", [["5 مجم", "TABF"]]],
  ["رانولازين", "Ranolazine", "cardio", [["500 مجم", "TABF"]]],
  ["ساكوبيتريل + فالصارتان", "Sacubitril + Valsartan", "cardioCombo", [["49/51 مجم", "TABF"]]],
  ["نيبيفولول", "Nebivolol", "cardio", [["5 مجم", "TABF"]]],
  ["سوتالول", "Sotalol", "cardio", [["80 مجم", "TABF"]]],
  ["هيدرالازين", "Hydralazine", "cardio", [["25 مجم", "TAB"]]],
  ["أملوديبين + لوزارتان", "Amlodipine + Losartan", "cardioCombo", [["5/50 مجم", "TABF"]]],
  ["أملوديبين + أتورڤاستاتين", "Amlodipine + Atorvastatin", "cardioCombo", [["5/10 مجم", "TABF"]]],
  ["أملوديبين 2.5 مجم", "Amlodipine 2.5mg", "cardio", [["2.5 مجم", "TABF"]]],

  // ═══════════ مدرات وعيون ═══════════
  ["أسيتازولاميد", "Acetazolamide", "misc2", [["250 مجم", "TABF"]]],
  ["تورسيميد", "Torsemide", "diuretic", [["10 مجم", "TABF"]]],
  ["ألفوزوسين", "Alfuzosin", "uro", [["10 مجم", "TABF"]]],
  ["ميرابيجرون", "Mirabegron", "uro", [["25 مجم", "TABF"]]],

  // ═══════════ عصبية إضافية ═══════════
  ["أريبيبرازول", "Aripiprazole", "neuro-psy", [["10 مجم", "TABF"]]],
  ["بوسبيرون", "Buspirone", "neuro-ssri", [["10 مجم", "TABF"]]],
  ["دوكسيلامين", "Doxylamine", "antihist", [["25 مجم", "TABF"]]],

  // ═══════════ طفيليات ═══════════
  ["أيفرمكتين", "Ivermectin", "helm", [["3 مجم", "TABF"]]],
  ["بيرانتيل", "Pyrantel", "helm", [["250 مجم/5 مل", "SUS"]]],
  ["برازيكوانتيل", "Praziquantel", "helm", [["600 مجم", "TABF"]]],

  // ═══════════ جلدية إضافية ═══════════
  ["مينوكسيديل موضعي", "Minoxidil Topical", "derm", [["2%", "SOL"], ["5%", "SOL"]]],
  ["تريامسينولون موضعي", "Triamcinolone Topical", "derm", [["0.1%", "CREAM"]]],
  ["تربينافين موضعي", "Terbinafine Topical", "antiF-top", [["1%", "CREAM"]]],
  ["كلوتريمازول + بيتاميثازون", "Clotrimazole + Betamethasone", "derm", [["كريم مركب", "CREAM"]]],
  ["سلفاديازين الفضة", "Silver Sulfadiazine", "derm", [["1%", "CREAM"]]],

  // ═══════════ هضم إضافية ═══════════
  ["بيكوسلفات الصوديوم", "Sodium Picosulfate", "lax", [["5 مجم", "TABF"]]],
  ["جليسرين تحاميل", "Glycerin Suppositories", "lax", [["2 جم", "SUP"]]],
  ["مسالازين", "Mesalazine", "misc2", [["800 مجم", "TABF"]]],
  ["سلفاسالازين", "Sulfasalazine", "misc2", [["500 مجم", "TABF"]]],
  ["ليدوكايين حقن", "Lidocaine Injection", "misc", [["2%", "INJ"]]],

  // ═══════════ حقن ومحاليل وريدية ═══════════
  ["هيدروكورتيزون حقن", "Hydrocortisone Injection", "hormone", [["100 مجم", "INJ"]]],
  ["أوندانسيترون حقن", "Ondansetron Injection", "antiEm", [["8 مجم/4 مل", "INJ"]]],
  ["فيتامين ب12 حقن", "Vitamin B12 Injection", "supp", [["1000 مكجم/مل", "INJ"]]],
  ["محلول ملحي 0.9% كبير", "Sodium Chloride 0.9% IV", "misc", [["500 مل", "SOL"]]],
  ["دكستروز 5%", "Dextrose 5%", "misc", [["500 مل", "SOL"]]],
  ["رينجر لاكتات", "Ringer Lactate", "misc", [["500 مل", "SOL"]]],
  ["باراسيتامول وريدي", "Paracetamol IV", "pain", [["10 مجم/مل", "INJ"]]],
  ["إيزونيازيد", "Isoniazid", "misc2", [["300 مجم", "TABF"]]],
  ["ريفامبين", "Rifampicin", "misc2", [["300 مجم", "CAP"]]],
  ["بيرازيناميد", "Pyrazinamide", "misc2", [["500 مجم", "TABF"]]],
  ["إيثامبوتول", "Ethambutol", "misc2", [["400 مجم", "TABF"]]],
  ["فامسيكلوفير", "Famciclovir", "antiV", [["250 مجم", "TABF"]]],
  ["إنتيكاڤير", "Entecavir", "antiV", [["0.5 مجم", "TABF"]]],
  ["ريبافيرين", "Ribavirin", "antiV", [["200 مجم", "TABF"]]],
  ["داكلاتاڤير", "Daclatasvir", "antiV", [["60 مجم", "TABF"]]],
  ["سوفوسبوفير + ڤيلباتاڤير", "Sofosbuvir + Velpatasvir", "antiV", [["400/100 مجم", "TABF"]]],
  ["إبليرينون", "Eplerenone", "diuretic", [["25 مجم", "TABF"]]],
  ["سيفبودوكسيم", "Cefpodoxime", "ab-ceph", [["100 مجم", "TABF"], ["200 مجم", "TABF"]]],
  ["سيفادروكسيل", "Cefadroxil", "ab-ceph", [["500 مجم", "CAP"]]],
  ["أمبيسيلين + كلوكساسيلين", "Ampicillin + Cloxacillin", "ab-pen", [["500 مجم", "CAP"]]],
  ["لورنوكسيكام", "Lornoxicam", "nsaid", [["4 مجم", "TABF"], ["8 مجم", "TABF"]]],
  ["إيبراتروبيوم + سالبوتامول", "Ipratropium + Salbutamol", "resp", [["20/100 مكجم", "INH"]]],
  ["كلوروكين", "Chloroquine", "misc2", [["250 مجم", "TABF"]]],
  ["هيدروكسي كلوروكين", "Hydroxychloroquine", "misc2", [["200 مجم", "TABF"]]],
  ["ترانيكساميك أسيد", "Tranexamic Acid", "misc2", [["500 مجم", "TABF"], ["500 مجم/5 مل", "INJ"]]],
  ["إيتامسيلات", "Etamsylate", "misc2", [["250 مجم", "TABF"]]],
  ["سيلوستازول", "Cilostazol", "misc2", [["100 مجم", "TABF"]]],
  ["بيزافيبرات", "Bezafibrate", "fibrate", [["200 مجم", "TABF"]]],
  ["پنتوكسيفيلين", "Pentoxifylline", "misc2", [["400 مجم", "TABF"]]],
  ["إنسولين ديغلودك", "Insulin Degludec", "dm-ins", [["100 وحدة/مل", "PEN"]]],
  ["مانيتول", "Mannitol", "misc", [["20% 250 مل", "SOL"]]],
  ["فيتامين سي", "Vitamin C", "supp", [["500 مجم", "EFF"], ["1000 مجم", "EFF"]]],
  ["أرتيميثر + لوميفانترين", "Artemether + Lumefantrine", "misc2", [["20/120 مجم", "TABF"]]],
];
