// Supabase Edge Function - Cloudflare R2 Pre-signed URL Jeneratörü
// Dosya Yolu: supabase/functions/r2-uploader/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3.540.0"
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.540.0"

// CORS headers for preflight requests from mobile app
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { filename, contentType } = await req.json()

    if (!filename || !contentType) {
      return new Response(
        JSON.stringify({ error: 'filename ve contentType alanları zorunludur.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cloudflare R2 Kimlik Bilgilerini Çevre Değişkenlerinden (Secrets) Oku
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const endpoint = Deno.env.get('R2_ENDPOINT') // Örn: https://<account_id>.r2.cloudflarestorage.com
    const bucketName = Deno.env.get('R2_BUCKET_NAME') // Örn: chat-media
    const publicDomain = Deno.env.get('R2_PUBLIC_DOMAIN') // Örn: https://pub-xxx.r2.dev veya özel alan adınız

    if (!accessKeyId || !secretAccessKey || !endpoint || !bucketName) {
      return new Response(
        JSON.stringify({ error: 'Sunucu tarafında Cloudflare R2 kimlik bilgileri eksik yapılandırılmış.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // S3/R2 İstemcisini Başlat
    const s3 = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    })

    const uniqueFilename = `${Date.now()}-${filename}`
    
    // PUT komutunu oluştur (Telefona doğrudan bu adrese binary PUT yapma yetkisi vereceğiz)
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueFilename,
      ContentType: contentType,
    })

    // 5 dakika (300 saniye) geçerli pre-signed URL üret
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 })
    
    // Dosyanın yükleme bittikten sonra erişileceği genel link
    const publicUrl = publicDomain 
      ? `${publicDomain}/${uniqueFilename}`
      : `${endpoint}/${bucketName}/${uniqueFilename}`

    return new Response(
      JSON.stringify({ uploadUrl, publicUrl, filename: uniqueFilename }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
