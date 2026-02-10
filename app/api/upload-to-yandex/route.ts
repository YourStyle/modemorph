import {type NextRequest, NextResponse} from "next/server"
import {S3Client, PutObjectCommand} from "@aws-sdk/client-s3"

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get("file") as File
        const folder = formData.get("folder") as string
        if (!file) {
            return NextResponse.json({success: false, error: "No file provided"}, {status: 400})
        }
        if (!folder) {
            return NextResponse.json({success: false, error: "No folder provided"}, {status: 400})
        }
        if (!process.env.YANDEX_ACCESS_KEY_ID || !process.env.YANDEX_SECRET_ACCESS_KEY || !process.env.YANDEX_BUCKET_NAME) {
            return NextResponse.json({success: false, error: "Missing Yandex S3 credentials"}, {status: 500})
        }
        const s3Client = new S3Client({
            region: "ru-central1",
            endpoint: "https://storage.yandexcloud.net",
            credentials: {
                accessKeyId: process.env.YANDEX_ACCESS_KEY_ID,
                secretAccessKey: process.env.YANDEX_SECRET_ACCESS_KEY,
            },
        })
        const BUCKET_NAME = process.env.YANDEX_BUCKET_NAME
        const timestamp = Date.now()
        const randomString = Math.random().toString(36).substring(2, 15)
        const fileExtension = file.name.split(".").pop()
        const fileName = `${timestamp}-${randomString}.${fileExtension}`
        const key = `${folder}/${fileName}`
        console.log("Generated key:", key)
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        console.log("Buffer size:", buffer.length)
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: file.type,
            ACL: "public-read",
        })
        console.log("Uploading to S3...")
        await s3Client.send(command)
        const url = `https://storage.yandexcloud.net/${BUCKET_NAME}/${key}`
        console.log("Upload successful, URL:", url)
        return NextResponse.json({success: true, url: url, key: key,})
    } catch (error) {
        console.error("Error uploading to Yandex S3:", error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
        }, {status: 500},)
    }
}
