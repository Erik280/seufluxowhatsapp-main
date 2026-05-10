import boto3
from botocore.client import Config
from app.config import get_settings
import logging

logger = logging.getLogger("seufluxo.storage")

class StorageService:
    def __init__(self):
        self.settings = get_settings()
        self.s3 = boto3.client(
            "s3",
            endpoint_url=f"http{'s' if self.settings.minio_secure else ''}://{self.settings.minio_endpoint}",
            aws_access_key_id=self.settings.minio_access_key,
            aws_secret_access_key=self.settings.minio_secret_key,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1"
        )
        self.bucket = self.settings.minio_bucket
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self):
        try:
            self.s3.head_bucket(Bucket=self.bucket)
        except Exception:
            logger.info(f"Criando bucket {self.bucket} no MinIO...")
            try:
                self.s3.create_bucket(Bucket=self.bucket)
                # Configurar para acesso público de leitura
                policy = {
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Principal": "*",
                            "Action": ["s3:GetObject"],
                            "Resource": [f"arn:aws:s3:::{self.bucket}/*"]
                        }
                    ]
                }
                import json
                self.s3.put_bucket_policy(Bucket=self.bucket, Policy=json.dumps(policy))
            except Exception as e:
                logger.error(f"Erro ao criar bucket ou policy: {e}")

    def upload_file(self, file_content: bytes, filename: str, content_type: str) -> str:
        """Faz o upload para o MinIO e retorna a URL pública."""
        try:
            self.s3.put_object(
                Bucket=self.bucket,
                Key=filename,
                Body=file_content,
                ContentType=content_type
            )
            # Retorna a URL (Considerando o endpoint público do MinIO que normalmente está exposto)
            # Se minio_endpoint for interno (ex: minio:9000), a URL gerada precisa ser acessível externamente
            # Vamos usar um presigned URL se o endpoint for interno, mas como a Evolution API e o frontend precisam ver,
            # vamos gerar uma URL baseada no hostname público se possível, ou um presigned URL de 7 dias.
            
            # Gerando Presigned URL temporária para que a Evolution consiga baixar
            url = self.s3.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": self.bucket, "Key": filename},
                ExpiresIn=604800 # 7 dias
            )
            
            # Se for necessário URL limpa para painel: 
            # return f"https://{seu_dominio}/bucket/{filename}" 
            # Mas como não sabemos o proxy do minio, o presigned url garante o acesso.
            
            return url
        except Exception as e:
            logger.error(f"Erro no upload do MinIO: {e}")
            raise e
