# OCR locale opzionale

Questa cartella contiene il secondo motore OCR di BustaChiara. Gli asset sono
serviti esclusivamente dallo stesso dominio della PWA, vengono richiesti solo
quando le due letture Tesseract restano poco affidabili e sono poi conservati
dalla cache del service worker. Nessun documento o testo viene inviato a un
servizio esterno.

## Provenienza

- `ppocrv5-mobile-det.onnx`: conversione in ONNX del modello ufficiale
  `PP-OCRv5_mobile_det_infer` pubblicato dal progetto PaddleOCR.
  Fonte: <https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_infer.tar>
- `ppocrv5-latin-rec.onnx`: conversione in ONNX del modello ufficiale
  `latin_PP-OCRv5_mobile_rec_infer` pubblicato dal progetto PaddleOCR.
  Fonte: <https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/latin_PP-OCRv5_mobile_rec_infer.tar>
- conversione eseguita con `paddle2onnx 2.1.0`, input dinamici conservati;
- `ort.wasm.min.js`, `ort-wasm-simd-threaded.mjs` e
  `ort-wasm-simd-threaded.wasm`: ONNX Runtime Web 1.27.0.

PaddleOCR e i modelli sono distribuiti con licenza Apache-2.0:
<https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE>. ONNX Runtime è
distribuito con licenza MIT:
<https://github.com/microsoft/onnxruntime/blob/main/LICENSE>.

## Integrità (SHA-256)

```text
c8d9b07063420ce5365c74e42532de48238feeeedcdb7a330b195708bc38a93f  ppocrv5-mobile-det.onnx
20e6127d910ef10be0d0fe4a49e68d2474b07e83f57600cdd177b3edb561d194  ppocrv5-latin-rec.onnx
4ffbe0f87d09bf61bb2360a1529a25762544cc7cdf21a1b40994332e1331e00c  ppocrv5-latin-chars.json
ea3a767b15df7dbe3d695ec9c182ca0f15b2ce7750156c6b70276e11c28997f0  ort.wasm.min.js
0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3  ort-wasm-simd-threaded.mjs
d1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6  ort-wasm-simd-threaded.wasm
```

`tests/ai-ocr.test.mjs` ricontrolla automaticamente questi hash, il criterio di
attivazione, il decoder CTC, i riquadri del rilevatore e la fusione prudente con
Tesseract.
