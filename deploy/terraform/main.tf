variable "proxy_api_key" {
  description = "API key for the proxy"
  type        = string
  sensitive   = true
}

variable "target_llm_provider" {
  description = "LLM provider to use (openai, anthropic, gemini, groq, etc.)"
  type        = string
  default     = "groq"
}

variable "target_llm_api_key" {
  description = "API key for the target LLM provider"
  type        = string
  sensitive   = true
}

variable "target_llm_model" {
  description = "Model to use for the target LLM"
  type        = string
  default     = "llama-3.3-70b-versatile"
}

variable "verifier_llm_provider" {
  description = "LLM provider for fact-checking"
  type        = string
  default     = "groq"
}

variable "verifier_llm_api_key" {
  description = "API key for the verifier LLM"
  type        = string
  sensitive   = true
}

variable "verifier_llm_model" {
  description = "Model to use for the verifier LLM"
  type        = string
  default     = "llama-3.3-70b-versatile"
}

variable "domain" {
  description = "Domain name for the proxy (optional)"
  type        = string
  default     = ""
}

variable "email" {
  description = "Email for Let's Encrypt SSL certificates"
  type        = string
  default     = ""
}

variable "instance_type" {
  description = "AWS EC2 instance type"
  type        = string
  default     = "t3.medium"
}

provider "aws" {
  region = var.region
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-22.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
  owners = ["099720109477"]
}

resource "aws_security_group" "proxy" {
  name        = "groundkeeps-proxy"
  description = "groundkeeps proxy security group"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SSH"
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "groundkeeps-proxy" }

resource "aws_key_pair" "proxy" {
  key_name   = "groundkeeps-proxy-key"
  public_key = var.ssh_public_key
}

variable "ssh_public_key" {
  description = "Your SSH public key for accessing the instance"
  type        = string
}

resource "aws_instance" "proxy" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.proxy.key_name
  vpc_security_group_ids = [aws_security_group.proxy.id]

  user_data = templatefile("${path.module}/user-data.sh", {
    proxy_api_key          = var.proxy_api_key
    target_llm_provider    = var.target_llm_provider
    target_llm_api_key     = var.target_llm_api_key
    target_llm_model       = var.target_llm_model
    verifier_llm_provider  = var.verifier_llm_provider
    verifier_llm_api_key   = var.verifier_llm_api_key
    verifier_llm_model     = var.verifier_llm_model
    domain                 = var.domain
    email                  = var.email
  })

  tags = { Name = "groundkeeps-proxy" }
}

output "instance_ip" {
  value = aws_instance.proxy.public_ip
}

output "instance_dns" {
  value = aws_instance.proxy.public_dns
}

output "dashboard_url" {
  value = var.domain != "" ? "https://${var.domain}" : "http://${aws_instance.proxy.public_dns}"
}
